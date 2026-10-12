// Lean Firefox for a Chromebook (Linux / Crostini Firefox).
// Cuts memory, GPU/CPU work and background junk without breaking normal browsing.
// Firefox reads this file on every launch. To undo a line, delete it here AND
// reset that pref in about:config (user.js values stick in prefs.js otherwise).

// --- Memory ---
user_pref("browser.tabs.unloadOnLowMemory", true);              // unload idle tabs when RAM gets tight
user_pref("browser.tabs.min_inactive_duration_before_unload", 300000); // tabs idle 5+ min are fair game
user_pref("browser.cache.memory.capacity", 32768);              // 32 MB RAM cache instead of auto-sized
user_pref("browser.sessionhistory.max_total_viewers", 2);       // keep fewer back/forward pages alive in RAM
user_pref("browser.sessionstore.max_tabs_undo", 10);            // remember fewer closed tabs
user_pref("browser.sessionstore.interval", 60000);              // save session every 60s, not 15s
user_pref("accessibility.force_disabled", 1);                   // skip a11y engine (remove if you use a screen reader)

// --- Graphics / CPU ---
user_pref("toolkit.cosmeticAnimations.enabled", false);         // no tab/UI animations
user_pref("ui.prefersReducedMotion", 1);                        // tells sites to cut their animations too
user_pref("media.av1.enabled", false);                          // YouTube falls back to VP9/H.264, way easier on weak CPUs
user_pref("media.autoplay.default", 5);                         // block autoplay video and audio (click to play)

// --- Background stuff you don't need ---
user_pref("network.prefetch-next", false);
user_pref("network.predictor.enabled", false);
user_pref("browser.ml.enable", false);                          // local AI models (link previews, smart tab groups)
user_pref("browser.ml.chat.enabled", false);                    // AI chatbot sidebar
user_pref("extensions.pocket.enabled", false);
user_pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
user_pref("browser.newtabpage.activity-stream.showSponsored", false);
user_pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
user_pref("datareporting.healthreport.uploadEnabled", false);
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.enabled", false);
user_pref("toolkit.telemetry.unified", false);
user_pref("app.shield.optoutstudies.enabled", false);
user_pref("app.normandy.enabled", false);
