# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# Keep Aegis main activity, services, and JS bridge interfaces intact
-keep class com.hafgit99.aegisvault7.** { *; }
-keepclassmembers class com.hafgit99.aegisvault7.MainActivity$*Bridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve WebKit, Autofill, and Tauri reflection hooks
-keepattributes JavascriptInterface, RuntimeVisibleAnnotations, AnnotationDefault, Signature, InnerClasses, EnclosingMethod
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Do not expose original Kotlin/Java source file names in release stack traces.
-renamesourcefileattribute SourceFile

