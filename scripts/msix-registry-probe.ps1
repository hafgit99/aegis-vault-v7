#requires -Version 5.1
<#
.SYNOPSIS
    Proves or disproves that a Store/MSIX-packaged app can register a native
    messaging host.

.DESCRIPTION
    KalderaShield's browser extension is useless without the desktop app. The
    extension holds no vault of its own: every operation goes through
    chrome.runtime.sendNativeMessage to the host name
    `com.kalderashield.desktop`, which the browser resolves from

        HKCU\Software\Mozilla\NativeMessagingHosts\com.kalderashield.desktop
        HKCU\Software\Google\Chrome\NativeMessagingHosts\com.kalderashield.desktop
        HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.kalderashield.desktop

    A Store listing is only worth pursuing if a packaged app can put those keys
    somewhere a browser will actually read. Packaged (MSIX) apps get package
    identity, and package identity is what brings registry virtualization: writes
    outside the app's own container are redirected into a private hive that no
    other process can see. If that applies here, the browser never finds the host,
    the extension silently returns an empty vault forever, and the whole Store
    route is closed for this architecture.

    This probe settles it with a real MSIX package rather than an argument. It
    builds a throwaway full-trust app that performs one HKCU write, installs it
    so it acquires package identity, runs it, and inspects the real registry.

    The write uses a probe-specific key rather than the live native messaging
    path. The virtualization mechanism is identical for any path, and writing to
    the real key could collide with an installed KalderaShield.

.PARAMETER KeepArtifacts
    Leave the built package and layout on disk for inspection.

.EXAMPLE
    npm run windows:msix-probe
#>

[CmdletBinding()]
param(
    [switch]$KeepArtifacts,

    # Set only by the elevated relaunch. The parent process has no console of
    # its own to write to, so the transcript is the only record of the run.
    [string]$LogPath
)

$ErrorActionPreference = 'Stop'

# Re-launch as administrator, and wait for it while relaying its output.
#
# An unsigned package that contains executable content must be installed for all
# users, which requires elevation. That is documented behaviour rather than a
# quirk of the probe, so it is handled here instead of being left for the user to
# discover.
#
# The elevated instance runs in its own window and closes when it finishes, which
# is why the earlier version looked like it had done nothing. Capturing to a
# transcript and printing it after the wait means the result survives.
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
            [Security.Principal.WindowsBuiltInRole]::Administrator)) {

    if (-not $LogPath) {
        $LogPath = Join-Path $env:TEMP 'kalderashield-msix-probe.log'
    }
    Remove-Item $LogPath -Force -ErrorAction SilentlyContinue

    Write-Host 'Elevation required: an unsigned MSIX containing an executable must be installed for all users.' -ForegroundColor Yellow
    Write-Host 'Accept the UAC prompt. This window will print the result when it finishes.' -ForegroundColor Yellow
    Write-Host ''

    $arguments = @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', "`"$PSCommandPath`"",
        '-LogPath', "`"$LogPath`""
    )
    if ($KeepArtifacts) { $arguments += '-KeepArtifacts' }

    try {
        $child = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    } catch {
        Write-Host "Elevation was declined or unavailable: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }

    Write-Host ''
    Write-Host '=== probe output ================================================' -ForegroundColor Cyan
    if (Test-Path $LogPath) {
        Get-Content $LogPath | ForEach-Object { Write-Host $_ }
    } else {
        Write-Host 'No log file was produced. The elevated window was probably closed' -ForegroundColor Red
        Write-Host 'before it finished, or elevation was declined.' -ForegroundColor Red
    }
    Write-Host '=================================================================='
    Write-Host ''
    Write-Host "Log kept at: $LogPath"
    exit 0
}

# Elevated instance: record everything from here on.
if ($LogPath) {
    try {
        Start-Transcript -Path $LogPath -Force | Out-Null
    } catch {
        # A transcript failure must not abort the probe; the parent will just
        # report that no log appeared.
    }
}

$ProbeKey    = 'HKCU:\Software\KalderaShield\MsixRegistryProbe'
$RunMarker   = 'probe-ran.txt'
$PackageName = 'KalderaShield.MsixRegistryProbe'

# The special OID is what makes a package installable while unsigned.
#
# Microsoft requires it: without it deployment fails with 0x80073D2C,
# "the publisher is not in the unsigned namespace". It also guarantees an
# unsigned package can never share an identity with a signed one, so the probe
# cannot collide with, or impersonate, a real KalderaShield installation.
$Publisher   = 'CN=KalderaShieldProbe, OID.2.25.311729368913984317654407730594956997722=1'

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    [OK]   $m" -ForegroundColor Green }
function Write-Fail { param($m) Write-Host "    [FAIL] $m" -ForegroundColor Red }
function Write-Info { param($m) Write-Host "    [INFO] $m" -ForegroundColor Gray }

function Find-Tool {
    param([string]$Name)
    $sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\bin'
    return (Get-ChildItem $sdkRoot -Recurse -Filter $Name -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\' } |
            Select-Object -First 1).FullName
}

# ---------------------------------------------------------------------------
# 1. Preflight
# ---------------------------------------------------------------------------

Write-Step 'Checking prerequisites'

$makeappx = Find-Tool 'makeappx.exe'
if (-not $makeappx) { Write-Fail 'makeappx.exe not found. Install the Windows SDK.'; exit 1 }
Write-Ok "makeappx: $makeappx"

$csc = $null
foreach ($candidate in @(
    'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
    'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe')) {
    if (Test-Path $candidate) { $csc = $candidate; break }
}
if (-not $csc) { Write-Fail 'csc.exe not found.'; exit 1 }
Write-Ok "csc: $csc"

if (-not (Get-Command Add-AppxPackage -ErrorAction SilentlyContinue)) {
    Write-Fail 'Add-AppxPackage is unavailable.'; exit 1
}
if (-not (Get-Command Add-AppxPackage).Parameters.ContainsKey('AllowUnsigned')) {
    Write-Fail 'This Windows build has no Add-AppxPackage -AllowUnsigned; the probe cannot install an unsigned package.'
    exit 1
}
Write-Ok 'Add-AppxPackage -AllowUnsigned available'

# The work directory is deliberately short: signtool and the deployment stack
# both behave badly on deeply nested paths, and the layout is three tiny files.
#
# A leftover directory from an aborted run is removed rather than treated as an
# error. The name is specific to this probe and holds nothing but generated
# build output, and refusing to start because of it would leave the probe stuck
# after any crash.
$work = Join-Path $env:TEMP 'ksprobe'
$layout = Join-Path $work 'l'

if (Test-Path $work) {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
    Write-Info 'removed a leftover work directory from an earlier run'
}
New-Item -ItemType Directory -Force -Path $layout | Out-Null
Write-Info "work dir: $work ($($work.Length) chars)"

# Refuse to touch anything that already exists, so a previous run or a real
# installation can never be disturbed.
if (Test-Path $ProbeKey) {
    Write-Fail "A key already exists at $ProbeKey. Remove it before running."
    exit 1
}

# ---------------------------------------------------------------------------
# 2. Build the probe
# ---------------------------------------------------------------------------

Write-Step 'Building the probe application'

# Writes one HKCU key, then a marker under LocalAppData.
#
# The marker matters. If the registry key is missing afterwards, the two possible
# causes are "the app never ran" and "the app ran and was redirected", and they
# mean opposite things. LocalAppData for a packaged app lands under
# %LOCALAPPDATA%\Packages\<package family name>\..., which is on the real disk,
# so locating the marker there distinguishes the two.
$probeSource = @'
using System;
using System.IO;
using Microsoft.Win32;

internal static class Probe
{
    [STAThread]
    private static int Main()
    {
        try
        {
            using (var key = Registry.CurrentUser.CreateSubKey(@"Software\KalderaShield\MsixRegistryProbe"))
            {
                if (key == null) { return 2; }
                key.SetValue("marker", "written-by-probe");
                key.SetValue("packageIdentityPresent", HasPackageIdentity().ToString());
            }

            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            Directory.CreateDirectory(local);
            File.WriteAllText(Path.Combine(local, "probe-ran.txt"), DateTime.UtcNow.ToString("o"));
            return 0;
        }
        catch (Exception)
        {
            return 3;
        }
    }

    // Detects package identity, the precondition for virtualization. If this is
    // false the result says nothing about packaging, because the app was then an
    // ordinary unpackaged program with full registry access.
    private static bool HasPackageIdentity()
    {
        try
        {
            Type package = Type.GetType("Windows.ApplicationModel.Package, Windows, ContentType=WindowsRuntime");
            if (package == null) { return false; }
            object current = package.GetProperty("Current", System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Static).GetValue(null, null);
            if (current == null) { return false; }
            object id = current.GetType().GetProperty("Id").GetValue(current, null);
            return id != null && !string.IsNullOrEmpty(id.ToString());
        }
        catch
        {
            return false;
        }
    }
}
'@

$probeSourcePath = Join-Path $work 'Probe.cs'
Set-Content -Path $probeSourcePath -Value $probeSource -Encoding UTF8

$probeExe = Join-Path $layout 'probe.exe'
$compileOutput = & $csc /nologo /target:winexe /platform:x64 /out:"$probeExe" /reference:"System.dll" "$probeSourcePath" 2>&1
if (-not (Test-Path $probeExe)) {
    Write-Fail 'Probe compilation failed.'
    $compileOutput | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
    exit 1
}
Write-Ok 'probe.exe compiled'

# A logo is mandatory in AppxManifest Properties even for a package that is never
# displayed. Written as bytes rather than drawn, because System.Drawing is not
# loaded in every session and referencing Bitmap without it throws.
$png = [byte[]]@(
    0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,
    0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
    0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
    0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,
    0x89,0x00,0x00,0x00,0x0A,0x49,0x44,0x41,
    0x54,0x78,0x9C,0x63,0x00,0x01,0x00,0x00,
    0x05,0x00,0x01,0x0D,0x0A,0x2D,0xB4,0x00,
    0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,
    0x42,0x60,0x82
)
[System.IO.File]::WriteAllBytes((Join-Path $layout 'logo.png'), $png)
Write-Ok 'logo.png generated'

# VisualElements is mandatory: the schema rejects an Application element that has
# attributes but no children, even for a full-trust app.
$manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap rescap">
  <Identity Name="$PackageName" Publisher="$Publisher" Version="1.0.0.0" />
  <Properties>
    <DisplayName>KalderaShield MSIX Registry Probe</DisplayName>
    <PublisherDisplayName>KalderaShield Probe</PublisherDisplayName>
    <Logo>logo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.26100.0" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="Probe" Executable="probe.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="MSIX Registry Probe"
                          Description="Measures whether a packaged app can write to the real registry."
                          BackgroundColor="transparent"
                          Square150x150Logo="logo.png"
                          Square44x44Logo="logo.png" />
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@
Set-Content -Path (Join-Path $layout 'AppxManifest.xml') -Value $manifest -Encoding UTF8
Write-Ok 'AppxManifest.xml written'

$msix = Join-Path $work 'p.msix'
$packOutput = & $makeappx pack /d "$layout" /p "$msix" /o /nv 2>&1
if (-not (Test-Path $msix)) {
    Write-Fail 'makeappx failed to produce a package.'
    $packOutput | ForEach-Object { Write-Host "      $_" -ForegroundColor DarkGray }
    exit 1
}
Write-Ok 'package built'

# ---------------------------------------------------------------------------
# 3. Install so the app acquires package identity
# ---------------------------------------------------------------------------

Write-Step 'Installing the package'

# -AllowUnsigned avoids the whole certificate detour. Signing with a self-signed
# certificate does not help either: AppX deployment validates against the local
# machine's trust store, so a CurrentUser\Root entry is rejected with
# 0x800B0109 and importing to LocalMachine\Root would need elevation.
try {
    Add-AppxPackage -Path $msix -AllowUnsigned -ErrorAction Stop
    Write-Ok 'Add-AppxPackage succeeded'
} catch {
    Write-Fail "Add-AppxPackage failed: $($_.Exception.Message)"
    Write-Host ''
    Write-Host '    Installing an unsigned package needs Developer Mode:' -ForegroundColor Yellow
    Write-Host '    Settings > System > For developers > Developer Mode' -ForegroundColor Yellow
    if (-not $KeepArtifacts) { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
    exit 1
}

$installed = Get-AppxPackage -Name $PackageName -ErrorAction SilentlyContinue
if (-not $installed) {
    Write-Fail 'Package is not registered even though installation reported success.'
    if (-not $KeepArtifacts) { Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue }
    exit 1
}
Write-Ok "package family name: $($installed.PackageFamilyName)"

# ---------------------------------------------------------------------------
# 4. Run it
# ---------------------------------------------------------------------------

Write-Step 'Running the probe with package identity'

$aumid = "$($installed.PackageFamilyName)!Probe"
try {
    Start-Process "shell:AppsFolder\$aumid" -ErrorAction Stop | Out-Null
    Write-Ok "launched $aumid"
} catch {
    Write-Fail "Could not launch the packaged app: $($_.Exception.Message)"
}

$markerPath = Join-Path $env:LOCALAPPDATA $RunMarker
$deadline = (Get-Date).AddSeconds(25)
while ((Get-Date) -lt $deadline) {
    if (Test-Path $markerPath) { break }
    Start-Sleep -Milliseconds 300
}

$markerPathPkg = $null
$pkgLocal = Join-Path (Join-Path $env:LOCALAPPDATA 'Packages') $installed.PackageFamilyName
if (Test-Path $pkgLocal) {
    $found = Get-ChildItem $pkgLocal -Recurse -Filter $RunMarker -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $markerPathPkg = $found.FullName }
}

# ---------------------------------------------------------------------------
# 5. Verdict
# ---------------------------------------------------------------------------

Write-Step 'Verdict'

$ranInRealProfile = Test-Path $markerPath
$ranInPackageVhd = [bool]$markerPathPkg

if (-not $ranInRealProfile -and -not $ranInPackageVhd) {
    Write-Fail 'The probe never ran. No marker file was written anywhere.'
    Write-Host '    The result is inconclusive: confirm the app launches, then re-run.' -ForegroundColor Yellow
    $verdict = 'Inconclusive'
} else {
    Write-Ok "probe ran (marker: real profile=$ranInRealProfile, package container=$ranInPackageVhd)"
}

$realKeyExists = Test-Path $ProbeKey

Write-Host ''
if ($realKeyExists) {
    $props = Get-ItemProperty $ProbeKey
    Write-Host '    RESULT: VISIBLE IN THE REAL REGISTRY' -ForegroundColor Green
    Write-Host ''
    Write-Host "    marker value          : $($props.marker)"
    Write-Host "    package identity seen : $($props.packageIdentityPresent)"
    Write-Host ''
    Write-Host '    A packaged app CAN register a native messaging host.' -ForegroundColor Green
    Write-Host '    The Microsoft Store MSIX route stays open, and Microsoft' -ForegroundColor Green
    Write-Host '    re-signs the package for free.' -ForegroundColor Green
    $verdict = 'Visible'
} else {
    Write-Host '    RESULT: REDIRECTED, NOT VISIBLE' -ForegroundColor Red
    Write-Host ''
    if ($ranInPackageVhd) {
        Write-Host '    The app ran, but its HKCU write never reached the registry the' -ForegroundColor Red
        Write-Host '    browser reads. It was virtualized into the package hive.' -ForegroundColor Red
    }
    Write-Host ''
    Write-Host '    Consequence for KalderaShield: an MSIX-packaged desktop app' -ForegroundColor Red
    Write-Host '    cannot register the native messaging host. Firefox, Chrome and' -ForegroundColor Red
    Write-Host '    Edge would never find it, and because background.ts has no' -ForegroundColor Red
    Write-Host '    local fallback, the extension would return an empty vault.' -ForegroundColor Red
    Write-Host ''
    Write-Host '    The Store MSI/EXE route needs a paid certificate anyway, so the' -ForegroundColor Yellow
    Write-Host '    unsigned CI build workflow remains the Windows answer.' -ForegroundColor Yellow
    $verdict = 'Redirected'
}

# ---------------------------------------------------------------------------
# 6. Cleanup
# ---------------------------------------------------------------------------

Write-Step 'Cleaning up'

Remove-AppxPackage -Package $installed.PackageFullName -ErrorAction SilentlyContinue
Write-Ok 'package removed'

if (Test-Path $ProbeKey) {
    Remove-Item $ProbeKey -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok 'probe registry key removed'
} else {
    Write-Info 'no probe registry key to remove'
}

if (Test-Path $markerPath) { Remove-Item $markerPath -Force -ErrorAction SilentlyContinue }
if ($markerPathPkg)        { Remove-Item $markerPathPkg -Force -ErrorAction SilentlyContinue }
Write-Ok 'run markers removed'

if ($KeepArtifacts) {
    Write-Info "artifacts kept at $work"
} else {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
    Write-Ok 'work dir removed'
}

Write-Host ''
Write-Host "RESULT: $verdict" -ForegroundColor White
Write-Host ''

# Close the transcript before exiting, otherwise the last lines of the verdict
# can be missing from the log the parent prints.
if ($LogPath) {
    try { Stop-Transcript | Out-Null } catch { }
}
exit 0