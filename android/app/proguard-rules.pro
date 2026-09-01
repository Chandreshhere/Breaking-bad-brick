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

# ── Keep rules for this app ────────────────────────────────────────────────
# minifyEnabled is currently false (see build.gradle). These rules exist so
# that turning it on is a one-word change rather than an afternoon of
# chasing ClassNotFoundException on a device.

# Capacitor discovers plugins by annotation and instantiates them
# reflectively, so R8 sees no reference to them and strips them.
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod public *; }

# Anything reachable from JavaScript via addJavascriptInterface.
-keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }

# Google Mobile Ads and Firebase both rely on reflection over model classes.
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-keep class com.google.firebase.** { *; }
-dontwarn com.google.android.gms.**

# Line numbers make a Play Console stack trace readable. Keeping them costs
# a few KB; not keeping them costs you every crash report you will ever get.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
