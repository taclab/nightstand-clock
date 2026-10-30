# Changelog

## 1.4.0

- **Next alarm on the full screen clocks.** Choose the kiosk's Next alarm sensor under the new **Alarm** setting. The full screen analog clock shows the alarm opposite the date, after the 9. Like the phone, it shows only when the alarm rings within a day.
- **Square analog dials.** The Analog clock beside a widget and the full screen analog clock have square corners, as on the phone.
- **Full screen analog closer to the phone.** Larger, expanded numerals in Archivo with the 3 and the 9 out toward the edges, a slightly larger date with the day in white, and the alarm a little further from the 9. On screens less wide than the phone, such as the Echo Show 8, the date and the alarm shrink to keep clear of the hands.
- **Full screen digital redrawn.** The time fills the screen with a column beside it: the date, the temperature from the weather entity and the next alarm.
- Temperatures below zero use a true minus sign.
- The manifest names the oldest Kiosk Satellite release the plugin works on, 2026.10.30, the first with plugin icons.

## 1.3.0

- The second hand uses far less processor: it sweeps in a small layer of its own, turned by the graphics chip, and the rest of the clock changes once a second. On an Echo Show 5, from about 60% to 30% of the processor at 30 fps.
- **Second hand** setting: Smooth at 60 fps, the most fluid; Smooth at 30 fps, the default, a touch less fluid for less processor; or Ticking, once a second like a quartz watch, which uses almost nothing.

## 1.2.1

- Lighter calendar, sized after the phone's own: smaller digits with more room around them, a regular weight and a slightly softer white.

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
