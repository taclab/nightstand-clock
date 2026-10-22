# Changelog

## 1.2.0

- Analog round redrawn after the phone's own dial: even ticks with the hours in white, numerals on one circle with more room around them, two digit hours drawn in only slightly, and a margin around the dial.
- Inter's display cut for every clock and widget, finer and tighter at large sizes. Dial numerals use proportional digits, so 11 is narrow.
- Thinner hands, a longer minute hand on the round dial, and a lighter calendar.

## 1.1.1

- Analog round: 10, 11 and 12 keep the same gap to the ticks as the single digit hours instead of touching them.

## 1.1.0

- A sensor flickering around the night threshold, or a burst of Home Assistant updates, can no longer disable the plugin. Screensaver updates stay within Kiosk Satellite's budget of four a second, and the latest state is published a moment later.
- Night mode now ends only once a numeric entity climbs 10% above the threshold, and keeps its last state while the entity is unavailable.
- Changing the darkness threshold applies at once, without waiting for the sensor's next reading.
- Night mode always uses a black background, even with a light day background.
- The weather high and low come from today's forecast entry, picked by its date, and disappear once their day is over. The forecast refreshes every 30 minutes even when the weather entity does not change.
- The full screen clocks no longer format the date on every frame.
- Tests run on every push and pull request.

## 1.0.1

- The clock and widget fill wide 2:1 screens such as the Echo Show 5, without black bands on the sides.
- The digital time fits inside its ring, and the full screen analog date is larger.
- README screenshots.

## 1.0.0

- First release.
