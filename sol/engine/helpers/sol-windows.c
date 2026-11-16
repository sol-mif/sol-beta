// sol-windows <owner> [title]: the number of the window of the app named <owner> at the normal layer, the one titled
// <title> first, else its largest; nothing and exit 1 when it has none. It prints a number and nothing else: never a
// title, never another app's name. A big room runs it to find the window `screencapture -l` takes (the file it block),
// in place of osascript, which in a wall with the screen block can post the mouse and the keys (step 7 of the design).
// The engine builds it from this file with clang (helpers.ts); nothing here is run from the checkout.
#include <CoreGraphics/CoreGraphics.h>
#include <stdio.h>
#include <string.h>

static int text(CFDictionaryRef d, CFStringRef k, char *buf, size_t n) {
  CFStringRef s = CFDictionaryGetValue(d, k);
  return s && CFGetTypeID(s) == CFStringGetTypeID() && CFStringGetCString(s, buf, (CFIndex)n, kCFStringEncodingUTF8);
}
static long number(CFDictionaryRef d, CFStringRef k) {
  CFNumberRef v = CFDictionaryGetValue(d, k);
  long x = -1;
  if (v && CFGetTypeID(v) == CFNumberGetTypeID()) CFNumberGetValue(v, kCFNumberLongType, &x);
  return x;
}

int main(int argc, char **argv) {
  if (argc < 2 || argc > 3) { fputs("usage: sol-windows <owner> [title]\n", stderr); return 2; }
  CFArrayRef all = CGWindowListCopyWindowInfo(kCGWindowListOptionAll, kCGNullWindowID);
  if (!all) { fputs("no window list (is the screen allowed?)\n", stderr); return 1; }
  long best = -1;
  double score = -1;
  char buf[1024];
  for (CFIndex i = 0; i < CFArrayGetCount(all); i++) {
    CFDictionaryRef w = CFArrayGetValueAtIndex(all, i);
    if (!text(w, kCGWindowOwnerName, buf, sizeof buf) || strcmp(buf, argv[1]) != 0) continue;
    if (number(w, kCGWindowLayer) != 0) continue;
    CFDictionaryRef b = CFDictionaryGetValue(w, kCGWindowBounds);
    CGRect r;
    if (!b || !CGRectMakeWithDictionaryRepresentation(b, &r)) continue;
    double s = r.size.width * r.size.height;
    if (argc == 3 && text(w, kCGWindowName, buf, sizeof buf) && strcmp(buf, argv[2]) == 0) s += 1e12;
    if (s > score) { score = s; best = number(w, kCGWindowNumber); }
  }
  CFRelease(all);
  if (best < 0) return 1;
  printf("%ld\n", best);
  return 0;
}
