// SPDX-License-Identifier: Apache-2.0
import java.text.SimpleDateFormat;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import me.jxl.kiosk.plugins.PluginHost;
import nightstand.clock.NightstandClockPlugin;

public final class NightstandClockTest {
    /** Applies KS's real budget: a fifth publication within one second throws, which would disable the plugin. */
    static final class Host implements PluginHost {
        volatile Map<String, Object> options;
        volatile int publications;
        volatile int refused;
        final ArrayDeque<Long> recent = new ArrayDeque<>();
        final Set<String> subscriptions = new LinkedHashSet<>();
        final List<Map<String, Object>> calls = new ArrayList<>();
        CommandCallback pending;
        String status;
        public synchronized void publishScreensaverAsset(String key, String title, String entry, Map<String, Object> data) {
            assert "standby".equals(key) && "Nightstand Clock".equals(title) && "standby/index.html".equals(entry);
            long now = System.currentTimeMillis();
            while (!recent.isEmpty() && now - recent.peekFirst() >= 1000) recent.pollFirst();
            if (recent.size() >= 4 && ++refused > 0) throw new IllegalStateException("Too many screensaver changes");
            recent.addLast(now);
            options = new HashMap<>(data); publications++;
        }
        public void subscribe(String event) { subscriptions.add(event); }
        public void unsubscribe(String event) { subscriptions.remove(event); }
        public void haCall(Map<String, Object> message, CommandCallback callback) { calls.add(message); pending = callback; }
        public void status(String message, boolean error) { status = message; }
        public void showWindow(String title, String message, String button) {}
        public void hideWindow() {}
        public void log(String message) {}
        /** Let the plugin's deferred publication land, as it would between KS callbacks. */
        void settle() throws InterruptedException { Thread.sleep(1300); }
    }

    static Map<String, Object> snapshot(String state, Map<String, Object> attributes) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("status", "available");
        payload.put("state", state);
        payload.put("attributes", attributes);
        return payload;
    }

    static Map<String, Object> day(String date, Object high, Object low) {
        Map<String, Object> entry = new HashMap<>();
        entry.put("datetime", date + "T00:00:00+00:00");
        entry.put("temperature", high);
        entry.put("templow", low);
        return entry;
    }

    static Map<String, Object> forecastResponse(List<Map<String, Object>> days) {
        Map<String, Object> entity = new HashMap<>();
        entity.put("forecast", days);
        return Collections.singletonMap("response", Collections.singletonMap("weather.home", entity));
    }

    public static void main(String[] args) throws Exception {
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        long now = System.currentTimeMillis();
        String today = iso.format(new Date(now)), tomorrow = iso.format(new Date(now + 24 * 3600 * 1000L));
        if (!today.equals(iso.format(new Date(now + 60_000)))) Thread.sleep(61_000); // Not across midnight.
        today = iso.format(new Date()); tomorrow = iso.format(new Date(System.currentTimeMillis() + 24 * 3600 * 1000L));

        Host host = new Host();
        NightstandClockPlugin plugin = new NightstandClockPlugin();
        Map<String, Object> settings = new HashMap<>();
        settings.put("layout", "Clock and widget"); settings.put("clockStyle", "Analog round"); settings.put("widget", "Calendar");
        settings.put("fullscreenStyle", "Analog"); settings.put("showSeconds", true); settings.put("timeFormat", "Automatic");
        settings.put("language", "Français"); settings.put("weekStart", "Monday"); settings.put("primaryColor", "#AABBCC");
        settings.put("accentColor", "nope"); settings.put("secondsColor", "#FF9F0A"); settings.put("backgroundColor", "#000000");
        settings.put("weatherEntity", "weather.home"); settings.put("weatherName", ""); settings.put("nightMode", "Off");
        settings.put("nightStart", 22); settings.put("nightEnd", 7); settings.put("nightEntity", "sensor.lux");
        settings.put("nightThreshold", 10); settings.put("nightColor", "#FF2A1F"); settings.put("nightBrightness", 70);

        // Calendar with nothing to follow.
        plugin.start(host, settings);
        assert host.publications == 1;
        assert "analog-round".equals(host.options.get("clock")) && "calendar".equals(host.options.get("widget"));
        assert "fr".equals(host.options.get("locale")) && "monday".equals(host.options.get("weekStart"));
        assert "#AABBCC".equals(host.options.get("primary")) && "#FF3B30".equals(host.options.get("accent"));
        assert host.subscriptions.isEmpty() : host.subscriptions;

        // Unchanged settings do not recreate the page.
        plugin.configure(settings);
        assert host.publications == 1;

        // The weather widget follows its entity and asks for today's forecast when the entity has none.
        settings.put("widget", "Weather");
        plugin.configure(settings);
        assert host.subscriptions.equals(new LinkedHashSet<>(Arrays.asList("ha.entity.weather.home")));
        Map<String, Object> attributes = new HashMap<>();
        attributes.put("friendly_name", "Maison"); attributes.put("temperature", 19.4); attributes.put("temperature_unit", "°C");
        plugin.onEvent("ks.ha.entity.weather.home", snapshot("cloudy", attributes));
        assert "Maison".equals(host.options.get("weatherPlace")) && "cloudy".equals(host.options.get("weatherCondition"));
        assert Double.valueOf(19.4).equals(host.options.get("weatherTemperature")) && host.options.get("weatherHigh") == null;
        assert host.calls.size() == 1 && "get_forecasts".equals(host.calls.get(0).get("service"));

        // A forecast that starts tomorrow has nothing for today.
        host.pending.onResult(true, forecastResponse(Arrays.asList(day(tomorrow, 25, 15))), null);
        host.settle();
        assert host.options.get("weatherHigh") == null && host.options.get("weatherDate") == null : host.options;

        // Today's entry is picked by its date, wherever it sits in the list.
        plugin.configure(new HashMap<String, Object>() {{ putAll(settings); put("weatherEntity", "weather.other"); }});
        plugin.configure(settings);
        plugin.onEvent("ks.ha.entity.weather.home", snapshot("cloudy", attributes));
        assert host.calls.size() == 2;
        host.pending.onResult(true, forecastResponse(Arrays.asList(day("2001-01-01", 1, 0), day(today, 21, 12.5), day(tomorrow, 25, 15))), null);
        host.settle();
        assert Double.valueOf(21).equals(host.options.get("weatherHigh")) && Double.valueOf(12.5).equals(host.options.get("weatherLow"));
        assert today.equals(host.options.get("weatherDate"));
        assert host.status.contains("21° / 13°") : host.status;

        // A later update keeps the forecast without asking again.
        attributes.put("temperature", 20);
        plugin.onEvent("ks.ha.entity.weather.home", snapshot("sunny", attributes));
        assert host.calls.size() == 2 && Double.valueOf(21).equals(host.options.get("weatherHigh"));

        // Older integrations put the forecast in the entity. Only today's entry counts.
        Map<String, Object> legacy = new HashMap<>(attributes);
        legacy.put("forecast", Arrays.asList(day(tomorrow, 30, 20)));
        plugin.onEvent("ks.ha.entity.weather.home", snapshot("sunny", legacy));
        assert Double.valueOf(21).equals(host.options.get("weatherHigh")) : "A forecast for tomorrow replaced today's";

        // A place name replaces the entity's name.
        settings.put("weatherName", " Bath ");
        plugin.configure(settings);
        host.settle();
        assert "Bath".equals(host.options.get("weatherPlace"));

        // Night mode follows a numeric entity against the threshold.
        settings.put("nightMode", "Home Assistant entity");
        plugin.configure(settings);
        assert host.subscriptions.contains("ha.entity.sensor.lux");
        plugin.onEvent("ks.ha.entity.sensor.lux", snapshot("15", new HashMap<>()));
        host.settle();
        assert "entity".equals(host.options.get("night")) && Boolean.FALSE.equals(host.options.get("nightActive"));

        // Raising the threshold above the current reading turns night on without a new reading, and back.
        settings.put("nightThreshold", 20);
        plugin.configure(settings);
        host.settle();
        assert Boolean.TRUE.equals(host.options.get("nightActive"));
        settings.put("nightThreshold", 10);
        plugin.configure(settings);
        host.settle();
        assert Boolean.FALSE.equals(host.options.get("nightActive"));

        // Night holds until the reading climbs past the threshold plus a margin.
        plugin.onEvent("ks.ha.entity.sensor.lux", snapshot("9", new HashMap<>()));
        plugin.onEvent("ks.ha.entity.sensor.lux", snapshot("10.5", new HashMap<>()));
        host.settle();
        assert Boolean.TRUE.equals(host.options.get("nightActive"));

        // An unavailable entity keeps the last answer.
        Map<String, Object> unavailable = snapshot("unavailable", new HashMap<>());
        unavailable.put("status", "unavailable");
        plugin.onEvent("ks.ha.entity.sensor.lux", unavailable);
        assert Boolean.TRUE.equals(host.options.get("nightActive"));

        // Many real changes in one second stay within KS's budget, and the last one still lands.
        for (int i = 0; i < 8; i++) plugin.onEvent("ks.ha.entity.sensor.lux", snapshot(i % 2 == 0 ? "500" : "1", new HashMap<>()));
        host.settle();
        assert Boolean.TRUE.equals(host.options.get("nightActive")) : "The last reading, 1 lux, means night";
        assert host.refused == 0 : "The plugin went over KS's budget " + host.refused + " times";
        plugin.onEvent("ks.ha.entity.sensor.lux", snapshot("500", new HashMap<>()));
        host.settle();
        assert Boolean.FALSE.equals(host.options.get("nightActive"));

        // The full screen layout drops the weather subscription and uses its own style.
        settings.put("layout", "Full screen clock"); settings.put("fullscreenStyle", "Digital");
        plugin.configure(settings);
        host.settle();
        assert "full".equals(host.options.get("layout")) && "digital".equals(host.options.get("clock"));
        assert host.subscriptions.equals(new LinkedHashSet<>(Arrays.asList("ha.entity.sensor.lux"))) : host.subscriptions;

        // A late forecast after stop is ignored, and the plugin's thread is gone.
        settings.put("layout", "Clock and widget");
        plugin.configure(settings);
        plugin.onEvent("ks.ha.entity.weather.home", snapshot("rainy", new HashMap<>(attributes)));
        plugin.stop();
        int before = host.publications;
        if (host.pending != null) host.pending.onResult(true, forecastResponse(Arrays.asList(day(today, 5, 1))), null);
        Thread.sleep(1300);
        assert host.publications == before;
        for (Thread thread : Thread.getAllStackTraces().keySet()) assert !"nightstand-clock".equals(thread.getName()) : "Timer still running";
        System.out.println("NightstandClockTest passed");
    }
}
