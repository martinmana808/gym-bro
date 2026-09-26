# Workout avatars

Each workout is assigned one of the fighters in `src/lib/avatar.ts`, chosen from
a hash of its id — the same workout always gets the same one.

To give a fighter a face, drop an image here named after its slug:

```
public/avatars/arnold.jpg
public/avatars/rambo.jpg
public/avatars/rocky.jpg
public/avatars/goggins.jpg
public/avatars/chadd-wright.jpg
public/avatars/bruce-lee.jpg
public/avatars/drago.jpg
public/avatars/mr-t.jpg
public/avatars/apollo-creed.jpg
```

`.jpg`, `.jpeg`, `.png` and `.webp` all work. Square crops look best — they're
rendered in a rounded square at 40–44px, so a tight head-and-shoulders crop
reads far better than a full body shot. Anything from ~200×200 up is plenty.

Any slug without a file falls back to its monogram, so the app looks finished
whether or not the folder is full.

**A word on what you put here:** photographs of real people and film characters
are owned by whoever shot them. That's your call to make for a private app, but
it's why the repo ships with no images and why this is a drop-in folder rather
than something committed.
