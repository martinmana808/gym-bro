# Gym Bro on the iPhone home screen

Three things, in the order you should do them. The first one is required for
the other two.

App URL: <https://gym-bro-pi.vercel.app>

---

## 1. Install it (required)

iOS treats an installed web app very differently from a Safari tab — push
notifications **only** work once it's installed.

1. Open <https://gym-bro-pi.vercel.app> in **Safari** (not Chrome).
2. Tap **Share ⎋** → **Add to Home Screen** → **Add**.
3. Open Gym Bro **from the new home screen icon** from now on.

You can tell it worked: there's no Safari address bar at the top.

---

## 2. Rest-timer notifications

Once installed:

1. Open Gym Bro from the home screen icon.
2. On the **Workouts** screen, find **Rest timer notifications** → **Turn on**.
3. Accept the iOS permission prompt.
4. Tap **Send a test notification** — a buzz should land on your lock screen.

After that, every rest timer you start is also held by the server. If you lock
the phone or switch to another app while resting, you get a notification the
moment rest is up. If you're still looking at the app, you just get the normal
in-app beep and no duplicate notification.

Skipping rest, hitting +30s, tapping a different set, or finishing the workout
all cancel or move the pending notification.

**If notifications stop working after a couple of weeks:** that's a known iOS
quirk — it silently expires push subscriptions. Turn the toggle off and on
again and you're back.

---

## 3. Home screen widget (the workaround)

iOS does not let a web app publish a real widget — widgets are native-app only,
still true in iOS 26. Two ways to get close:

### Option A — one icon per training day (most reliable)

iOS lets you add the same site to the home screen more than once, each pinned
to a different page. So you get a "Day 1" icon that opens straight into chest
day.

For each day: open the URL below in Safari → **Share ⎋** → **Add to Home
Screen** → rename it (`Day 1 – Pecho`) → **Add**.

- Day 1 (Pecho / Biceps):
  `https://gym-bro-pi.vercel.app/workouts/d89af797-d02b-4298-8936-70e1a60c00f0/days/bef4ad88-3555-432b-b72a-c032d77aea3d`
- Day 2 (Espalda / Triceps):
  `https://gym-bro-pi.vercel.app/workouts/d89af797-d02b-4298-8936-70e1a60c00f0/days/8078bc4b-6f1b-4919-bade-b6a4a175dc1e`
- Day 3 (Piernas / Hombros):
  `https://gym-bro-pi.vercel.app/workouts/d89af797-d02b-4298-8936-70e1a60c00f0/days/c48bdba3-0bd4-491b-bd53-e0200ee0f6ce`

Put the three in a home screen folder and you have a workout launcher.

### Option B — a Shortcuts widget (looks most like a widget)

1. Open the **Shortcuts** app → **+** → **Add Action** → search **Open URLs**.
2. Paste one of the day URLs above.
3. Tap the shortcut name at the top → rename to `Day 1`, pick an icon/colour.
4. Repeat for Day 2 and Day 3.
5. On the home screen: long-press empty space → **Edit** → **Add Widget** →
   **Shortcuts** → pick the medium (2×2) size → place it.
6. Tap the placed widget → choose which shortcuts appear in it.

You end up with a single widget tile showing Day 1 / Day 2 / Day 3 buttons.

**Caveat:** a URL opened from Shortcuts may land in a Safari tab rather than
the installed web app, depending on your iOS version. You'll still be logged
in, but you lose the app-like chrome — and a Safari tab does **not** receive
push notifications. If that happens to you, use Option A for actually starting
a workout, and treat the widget as a bookmark.

---

## Why there's no real widget

Widgets on iOS are built with WidgetKit, which requires a native app shipped
through the App Store. There is no web API to declare one, on iOS or Android.
Live Activities (the Dynamic Island timer) are native-only for the same reason.
The rest-timer notification is the part of that experience that *is* reachable
from the web, which is why it's what got built.
