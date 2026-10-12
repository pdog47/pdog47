# Chromebook: lean Firefox + start page

For Firefox running in the Chromebook's Linux container (Crostini). Doesn't apply to the Play Store (Android) Firefox, which ignores `user.js`.

## What's here

- `user.js`: Firefox settings that cut RAM, CPU and GPU work. Unloads idle tabs when memory is low, kills animations, blocks autoplay, makes YouTube skip AV1 (heavy on weak chips), turns off AI features, sponsored junk and telemetry. Every line is commented.
- `startpage.html`: a tiny homepage. Big clock, search bar, number keys 1-9 jump to your links. No libraries, updates once a minute. Edit the `LINKS` list at the bottom to change links.
- `install.sh`: copies both into place.

## Install

In the Linux Terminal on the Chromebook, with Firefox closed:

```bash
git clone https://github.com/pdog47/pdog47.git
cd pdog47/chromebook
./install.sh
```

Then open Firefox. It backs up any existing `user.js` first.

## Undo

Delete `user.js` from your profile folder (`about:support` > Profile Folder), then reset any of those prefs in `about:config`. Firefox writes `user.js` values into `prefs.js`, so just deleting the file doesn't roll them back.
