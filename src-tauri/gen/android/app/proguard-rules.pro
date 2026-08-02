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
# JavaScript bridge method names are part of the WebView API contract.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-keepclassmembers,allowoptimization class com.hafgit99.aegisvault7.MainActivity$Android*Bridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Do not expose original Kotlin/Java source file names in release stack traces.
-renamesourcefileattribute SourceFile
