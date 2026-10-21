# Nightstand Clock

A bedside clock screensaver for [Kiosk Satellite](https://github.com/jxlarrea/kiosk-satellite), inspired by the landscape "standby" mode of phones on a charger: a large clock on the left with a calendar, the weather or the date on the right, or a single clock across the whole screen. A red night mode keeps the room dark.

Not affiliated with Apple.

## Looks

| Layout | Clock | Beside it |
| --- | --- | --- |
| Clock and widget | **Analog**: rounded square dial with 12, 3, 6 and 9 | **Calendar**: the month with today circled |
| | **Analog round**: circular dial with every hour | **Weather**: place, temperature, condition, today's high and low |
| | **Digital**: large numbers in a ring of ticks that fill with the seconds | **Date**: weekday, day and month |
| | | **None**: the clock alone, centered |
| Full screen clock | **Analog**: ticks out to the screen edges, the date inside the dial | |
| | **Digital**: large numbers under the date | |

Portrait screens stack the clock above the widget.

## Use it

1. Install and enable the plugin (see [Installation](#installation)).
2. Choose **Nightstand Clock (Nightstand Clock)** under **Settings > Screensaver > Screensaver mode**, or in a screensaver schedule entry.
3. Adjust it from **Settings > Plugin Manager > Nightstand Clock**. Changes apply to the running screensaver right away.

Kiosk Satellite still decides when the screensaver starts and stops, its brightness, pixel shift and wake triggers.

## Settings

| Group | Setting | Meaning |
| --- | --- | --- |
| Layout | Layout | Clock and widget, or Full screen clock |
| | Clock | Analog, Analog round or Digital, beside a widget |
| | Widget | Calendar, Weather, Date or None |
| | Full screen clock | Analog or Digital |
| Time and date | Show seconds | Second hand on analog clocks, the ring of seconds on the digital one |
| | Time format | Automatic, 24-hour or 12-hour |
| | Language | Month, weekday and weather names: Automatic (device), English, Français, Deutsch, Español, Italiano, Português, Nederlands |
| | First day of the week | Automatic, Monday, Sunday or Saturday |
| Colors | Main color | Hands, numbers, ticks and text. White by default |
| | Accent color | Month name, today and the date. Red by default |
| | Second hand color | Orange by default |
| | Background color | Black by default, best on OLED screens |
| Weather | Weather entity | A Home Assistant `weather.*` entity for the Weather widget |
| | Place name | Shown above the temperature. Empty uses the entity's name |
| Night mode | Night mode | Off, Always, Schedule or Home Assistant entity |
| | Night starts at / ends at | Hours for Schedule, such as 22 to 7 |
| | Night entity | Night while it is `on`, `true` or `below_horizon` (`sun.sun`). For a number, such as an illuminance sensor, night below the threshold |
| | Darkness threshold | For a numeric night entity |
| | Night color | Everything is drawn in this color at night. Red by default |
| | Night brightness | Dims the clock further at night, in percent |

## Data and permissions

The plugin declares three capabilities:

- `screensaver` to draw the clock.
- `host.read` to follow the weather entity and the night entity through Kiosk Satellite's own Home Assistant connection.
- `ha` to call `weather.get_forecasts` for today's high and low, at most twice an hour, when the weather entity has no forecast attribute.

It sends nothing anywhere else. The screensaver page has no network access. The Inter font is bundled under the SIL Open Font License (`assets/standby/fonts/OFL.txt`).

## Installation

Use the button below to open Nightstand Clock in your Kiosk Satellite and install it.

[![Install in Kiosk Satellite](https://kiosksatellite.com/img/badges/plugin-add.svg)](https://kiosksatellite.com/redirect/plugin/?repository=taclab/nightstand-clock)

### Manual

1. Open **Settings > Plugin Manager** in Kiosk Satellite and turn on **Enable Plugins**.
2. Choose **Add plugin**, paste `https://github.com/taclab/nightstand-clock` and choose **Preview**.
3. Review the plugin and choose **Trust and install**, then enable it from its entry row.

### Local build

```sh
python3 tools/test.py
python3 tools/build.py
```

Then install `dist/nightstand-clock-<version>.zip` from **Plugin Manager > Developer Tools > Install from ZIP**. Building needs Python 3, JDK 17 or newer and an Android SDK with build-tools, as described in the [plugin SDK guide](https://github.com/jxlarrea/kiosk-satellite-plugins/blob/main/docs/getting-started.md).

## Development

- `src/nightstand/clock/`: the plugin. It turns the settings and the Home Assistant readings into rendering options and republishes the screensaver only when they change.
- `assets/standby/`: the screensaver page. Everything is drawn in SVG and scales to any screen.
- `tests/NightstandClockTest.java`: settings, weather, forecast and night mode against a fake host.

To preview the page in a desktop browser, serve the repository (`python3 -m http.server`) and open `assets/standby/index.html#` followed by URL-encoded options, for example `#%7B%22clock%22%3A%22digital%22%7D` for `{"clock":"digital"}`.

## License

[Apache-2.0](LICENSE). The SDK in `sdk/` and the build tools in `tools/` come from the [Kiosk Satellite plugin template](https://github.com/jxlarrea/kiosk-satellite-plugins).
