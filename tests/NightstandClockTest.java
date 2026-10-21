// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import me.jxl.kiosk.plugins.PluginHost;
import nightstand.clock.NightstandClockPlugin;

public final class NightstandClockTest {
    static final class Host implements PluginHost {
        Map<String, Object> options;
        int publications;
        final Set<String> subscriptions = new LinkedHashSet<>();
        final List<Map<String, Object>> calls = new ArrayList<>();
        CommandCallback pending;
        String status;
        public void publishScreensaverAsset(String key, String title, String entry, Map<String, Object> data) {
            assert "standby".equals(key) && "Nightstand Clock".equals(title) && "standby/index.html".equals(entry);
            options = new HashMap<>(data); publications++;
        }
        public void subscribe(String event) { subscriptions.add(event); }
        public void unsubscribe(String event) { subscriptions.remove(event); }
        public void haCall(Map<String, Object> message, CommandCallback callback) { calls.add(message); pending = callback; }
        public void status(String message, boolean error) { status = message; }
        public void showWindow(String title, String message, String button) {}
        public void hideWindow() {}
        public void log(String message) {}
    }

    static Map<String, Object> snapshot(String state, Map<String, Object> attributes) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("status", "available");
        payload.put("state", state);
        payload.put("attributes", attributes);
        return payload;
    }

    public static void main(String[] args) throws Exception {
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
        Map<String, Object> today = new HashMap<>();
        today.put("temperature", 21); today.put("templow", 12.5);
        Map<String, Object> entity = new HashMap<>();
        entity.put("forecast", Arrays.asList(today));
        Map<String, Object> response = new HashMap<>();
        response.put("weather.home", entity);
        host.pending.onResult(true, java.util.Collections.singletonMap("response", response), null);
        assert Double.valueOf(21).equals(host.options.get("weatherHigh")) && Double.valueOf(12.5).equals(host.options.get("weatherLow"));
        assert host.status.contains("21° / 13°") : host.status;

        // A later update keeps the forecast without asking again.
        attributes.put("temperature", 20);
        plugin.onEvent("ks.ha.entity.weather.home", snapshot("sunny", attributes));
        assert host.calls.size() == 1 && Double.valueOf(21).equals(host.options.get("weatherHigh"));

        // A place name replaces the entity's name.
        settings.put("weatherName", " Bath ");
        plugin.configure(settings);
        assert "Bath".equals(host.options.get("weatherPlace"));

        // Night mode follows a numeric entity against the threshold, without republishing small changes.
        settings.put("nightMode", "Home Assistant entity");
        plugin.configure(settings);
        assert host.subscriptions.contains("ha.entity.sensor.lux") && "entity".equals(host.options.get("night"));
        plugin.onEvent("ks.ha.entity.sensor.lux", snapshot("3", new HashMap<>()));
        assert Boolean.TRUE.equals(host.options.get("nightActive"));
        int before = host.publications;
        plugin.onEvent("ks.ha.entity.sensor.lux", snapshot("4", new HashMap<>()));
        assert host.publications == before;
        plugin.onEvent("ks.ha.entity.sensor.lux", snapshot("250", new HashMap<>()));
        assert Boolean.FALSE.equals(host.options.get("nightActive"));
        java.lang.reflect.Method isNight = NightstandClockPlugin.class.getDeclaredMethod("isNight", Map.class, double.class);
        isNight.setAccessible(true);
        assert Boolean.TRUE.equals(isNight.invoke(null, snapshot("below_horizon", new HashMap<>()), 10.0));

        // The full screen layout drops the weather subscription and uses its own style.
        settings.put("layout", "Full screen clock"); settings.put("fullscreenStyle", "Digital");
        plugin.configure(settings);
        assert "full".equals(host.options.get("layout")) && "digital".equals(host.options.get("clock"));
        assert host.subscriptions.equals(new LinkedHashSet<>(Arrays.asList("ha.entity.sensor.lux"))) : host.subscriptions;

        // A late forecast for a dropped entity is ignored.
        settings.put("layout", "Clock and widget");
        plugin.configure(settings);
        plugin.onEvent("ks.ha.entity.weather.home", snapshot("rainy", new HashMap<>(attributes)));
        plugin.stop();
        before = host.publications;
        if (host.calls.size() > 1) host.pending.onResult(true, java.util.Collections.singletonMap("response", response), null);
        assert host.publications == before;
        System.out.println("NightstandClockTest passed");
    }
}
