// SPDX-License-Identifier: Apache-2.0
package nightstand.clock;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Rendering options for assets/standby/index.html. KS owns the screensaver lifecycle. */
final class ClockOptions {
    private ClockOptions() {}

    static String color(Object value, String fallback) {
        return value instanceof String && ((String) value).matches("#[a-fA-F0-9]{6}") ? (String) value : fallback;
    }

    static String choice(Object value, String fallback, String... options) {
        List<String> allowed = Arrays.asList(options);
        return value instanceof String && allowed.contains(value) ? (String) value : fallback;
    }

    static double number(Object value, double fallback, double min, double max) {
        double result = value instanceof Number ? ((Number) value).doubleValue() : fallback;
        return Double.isFinite(result) ? Math.max(min, Math.min(max, result)) : fallback;
    }

    static String text(Object value) {
        return value instanceof String ? ((String) value).trim() : "";
    }

    private static String locale(Object value) {
        switch (choice(value, "Automatic", "Automatic", "English", "Français", "Deutsch", "Español", "Italiano", "Português", "Nederlands")) {
            case "English": return "en";
            case "Français": return "fr";
            case "Deutsch": return "de";
            case "Español": return "es";
            case "Italiano": return "it";
            case "Português": return "pt";
            case "Nederlands": return "nl";
            default: return "";
        }
    }

    /**
     * Settings, then the latest weather, today's forecast, night readings and next alarm, as scalar values for the page.
     * The page shows the high and the low only while weatherDate is still its own date, so they vanish at midnight. It
     * shows the alarm only when it rings within a day.
     */
    static Map<String, Object> options(Map<String, Object> settings, Weather weather, Weather.Day today, Boolean nightEntityActive,
                                       String alarm) {
        Map<String, Object> data = new LinkedHashMap<>();
        boolean full = "Full screen clock".equals(choice(settings.get("layout"), "Clock and widget", "Clock and widget", "Full screen clock"));
        data.put("layout", full ? "full" : "widget");
        data.put("clock", full
            ? choice(settings.get("fullscreenStyle"), "Analog", "Analog", "Digital").toLowerCase()
            : choice(settings.get("clockStyle"), "Analog", "Analog", "Analog round", "Digital").toLowerCase().replace(' ', '-'));
        data.put("widget", choice(settings.get("widget"), "Calendar", "Calendar", "Weather", "Date", "None").toLowerCase());
        data.put("seconds", !Boolean.FALSE.equals(settings.get("showSeconds")));
        String hand = choice(settings.get("secondHand"), "Smooth, 30 fps", "Smooth, 60 fps", "Smooth, 30 fps", "Ticking");
        data.put("secondHand", hand.equals("Ticking") ? "tick" : hand.equals("Smooth, 60 fps") ? "60" : "30");
        data.put("timeFormat", choice(settings.get("timeFormat"), "Automatic", "Automatic", "24-hour", "12-hour").toLowerCase());
        data.put("locale", locale(settings.get("language")));
        data.put("weekStart", choice(settings.get("weekStart"), "Automatic", "Automatic", "Monday", "Sunday", "Saturday").toLowerCase());
        data.put("primary", color(settings.get("primaryColor"), "#FFFFFF"));
        data.put("accent", color(settings.get("accentColor"), "#FF3B30"));
        data.put("secondsColor", color(settings.get("secondsColor"), "#FF9F0A"));
        data.put("background", color(settings.get("backgroundColor"), "#000000"));

        String night = choice(settings.get("nightMode"), "Off", "Off", "Always", "Schedule", "Home Assistant entity");
        data.put("night", "Home Assistant entity".equals(night) ? "entity" : night.toLowerCase());
        data.put("nightStart", (int) number(settings.get("nightStart"), 22, 0, 23));
        data.put("nightEnd", (int) number(settings.get("nightEnd"), 7, 0, 23));
        data.put("nightActive", Boolean.TRUE.equals(nightEntityActive));
        data.put("nightColor", color(settings.get("nightColor"), "#FF2A1F"));
        data.put("nightBrightness", number(settings.get("nightBrightness"), 70, 20, 100));

        String place = text(settings.get("weatherName"));
        data.put("weatherConfigured", !text(settings.get("weatherEntity")).isEmpty());
        data.put("weatherPlace", place.isEmpty() && weather != null ? weather.name : place);
        data.put("weatherCondition", weather == null ? null : weather.condition);
        data.put("weatherTemperature", weather == null ? null : weather.temperature);
        data.put("weatherUnit", weather == null ? null : weather.unit);
        boolean extremes = weather != null && today != null;
        data.put("weatherDate", extremes ? today.date : null);
        data.put("weatherHigh", extremes ? today.high : null);
        data.put("weatherLow", extremes ? today.low : null);
        data.put("alarm", full ? alarm : null);
        return data;
    }
}
