// SPDX-License-Identifier: Apache-2.0
package nightstand.clock;

import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import me.jxl.kiosk.plugins.KioskPlugin;
import me.jxl.kiosk.plugins.PluginHost;

/**
 * Publishes the nightstand clock screensaver. The page draws the clock itself. This class turns the settings into
 * rendering options and follows the Home Assistant entities behind the weather widget and night mode.
 */
public final class NightstandClockPlugin implements KioskPlugin {
    static final String KEY = "standby";
    static final String TITLE = "Nightstand Clock";
    static final String ENTRY = "standby/index.html";
    static final long FORECAST_INTERVAL_MS = 30 * 60 * 1000L;

    private PluginHost host;
    private boolean alive;
    private Map<String, Object> settings = Collections.emptyMap();
    private final Set<String> subscribed = new LinkedHashSet<>();
    private String weatherEntity = "";
    private String nightEntity = "";
    private Weather weather;
    private Double[] forecast = new Double[2];
    private long forecastAt;
    private int forecastRevision;
    private Boolean nightActive;
    private Map<String, Object> published;
    private String lastStatus;

    @Override public void start(PluginHost host, Map<String, Object> settings) {
        this.host = host;
        alive = true;
        configure(settings);
    }

    @Override public void configure(Map<String, Object> settings) {
        this.settings = new HashMap<>(settings);
        boolean weatherShown = "Clock and widget".equals(ClockOptions.choice(settings.get("layout"), "Clock and widget", "Clock and widget", "Full screen clock"))
            && "Weather".equals(settings.get("widget"));
        String nextWeather = weatherShown ? ClockOptions.text(settings.get("weatherEntity")) : "";
        String nextNight = "Home Assistant entity".equals(settings.get("nightMode")) ? ClockOptions.text(settings.get("nightEntity")) : "";
        if (!nextWeather.equals(weatherEntity)) {
            weather = null;
            forecast = new Double[2];
            forecastAt = 0;
            forecastRevision++;
        }
        if (!nextNight.equals(nightEntity)) nightActive = null;
        weatherEntity = nextWeather;
        nightEntity = nextNight;
        follow();
        publish();
    }

    /** Subscribe to the entities in use and drop the others. Each subscription starts with a snapshot. */
    private void follow() {
        Set<String> wanted = new LinkedHashSet<>();
        if (!weatherEntity.isEmpty()) wanted.add(weatherEntity);
        if (!nightEntity.isEmpty()) wanted.add(nightEntity);
        for (String entity : new LinkedHashSet<>(subscribed)) {
            if (!wanted.contains(entity)) {
                host.unsubscribe("ha.entity." + entity);
                subscribed.remove(entity);
            }
        }
        for (String entity : wanted) {
            if (subscribed.add(entity)) host.subscribe("ha.entity." + entity);
        }
    }

    @Override public void onEvent(String event, Map<String, Object> payload) {
        if (!event.startsWith("ks.ha.entity.")) return;
        String entity = event.substring("ks.ha.entity.".length());
        if (entity.equals(weatherEntity)) {
            weather = Weather.fromSnapshot(payload);
            refreshForecast();
        }
        if (entity.equals(nightEntity)) {
            nightActive = isNight(payload, ClockOptions.number(settings.get("nightThreshold"), 10, 0, 1000));
        }
        publish();
    }

    /** Recent weather entities keep the forecast behind weather.get_forecasts. Ask for it twice an hour at most. */
    private void refreshForecast() {
        if (weather == null || weather.high != null) return;
        long now = System.currentTimeMillis();
        if (forecastAt != 0 && now - forecastAt < FORECAST_INTERVAL_MS) return;
        forecastAt = now;
        final int revision = ++forecastRevision;
        final String entity = weatherEntity;
        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", "call_service");
        message.put("domain", "weather");
        message.put("service", "get_forecasts");
        message.put("service_data", Collections.singletonMap("type", "daily"));
        message.put("target", Collections.singletonMap("entity_id", entity));
        message.put("return_response", true);
        try {
            host.haCall(message, (ok, data, error) -> {
                if (!alive || revision != forecastRevision) return;
                if (!ok) {
                    host.log("No daily forecast for " + entity + ": " + error);
                    return;
                }
                forecast = Weather.fromForecastResponse(data, entity);
                publish();
            });
        } catch (UnsupportedOperationException e) {
            host.log("This Kiosk Satellite cannot call Home Assistant services, so the forecast stays hidden.");
        }
    }

    /** Night for on, true and below_horizon, or below the threshold for a number. Null when HA has no state. */
    static Boolean isNight(Map<String, Object> snapshot, double threshold) {
        if (snapshot == null || !"available".equals(snapshot.get("status")) || !(snapshot.get("state") instanceof String)) return null;
        String state = ((String) snapshot.get("state")).trim().toLowerCase();
        Double value = Weather.number(state);
        if (value != null) return value < threshold;
        return state.equals("on") || state.equals("true") || state.equals("below_horizon") || state.equals("night");
    }

    private void publish() {
        if (!alive) return;
        Weather shown = weather == null || weather.high != null ? weather : weather.withForecast(forecast[0], forecast[1]);
        Map<String, Object> options = ClockOptions.options(settings, shown, nightActive);
        if (!options.equals(published)) {
            host.publishScreensaverAsset(KEY, TITLE, ENTRY, options);
            published = options;
        }
        showStatus(shown);
    }

    private void showStatus(Weather shown) {
        StringBuilder status = new StringBuilder("Choose Nightstand Clock under Screensaver > Screensaver mode.");
        if (!weatherEntity.isEmpty()) {
            status.append(shown == null || shown.temperature == null
                ? " Waiting for " + weatherEntity + "."
                : " Weather: " + shown.condition + ", " + Math.round(shown.temperature) + "°"
                    + (shown.high != null && shown.low != null ? " (" + Math.round(shown.high) + "° / " + Math.round(shown.low) + "°)" : "") + ".");
        }
        if (!nightEntity.isEmpty()) {
            status.append(nightActive == null ? " Waiting for " + nightEntity + "." : nightActive ? " Night mode on." : " Night mode off.");
        }
        String text = status.toString();
        if (text.equals(lastStatus)) return;
        lastStatus = text;
        host.status(text, false);
    }

    @Override public void execute(String command, Map<String, Object> arguments) {
        throw new IllegalArgumentException("Nightstand Clock has no actions");
    }

    @Override public void stop() {
        alive = false;
        // KS removes the screensaver and every subscription when the session ends.
        subscribed.clear();
        published = null;
    }
}
