// SPDX-License-Identifier: Apache-2.0
package nightstand.clock;

import java.util.ArrayDeque;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import me.jxl.kiosk.plugins.KioskPlugin;
import me.jxl.kiosk.plugins.PluginHost;

/**
 * Publishes the nightstand clock screensaver. The page draws the clock itself. This class turns the settings into
 * rendering options and follows the Home Assistant entities behind the weather widget and night mode.
 *
 * KS callbacks and the plugin's own timer thread both change the state below, so every access holds {@code lock}.
 */
public final class NightstandClockPlugin implements KioskPlugin {
    static final String KEY = "standby";
    static final String TITLE = "Nightstand Clock";
    static final String ENTRY = "standby/index.html";
    static final long FORECAST_INTERVAL_MS = 30 * 60 * 1000L;
    static final long FORECAST_RETRY_MS = 5 * 60 * 1000L;
    /** KS allows four publish or remove calls a second. Stay under it with room for clock drift. */
    static final int PUBLICATIONS_PER_WINDOW = 3;
    static final long PUBLICATION_WINDOW_MS = 1100;
    static final long MAX_RETRY_MS = 60_000;

    private final Object lock = new Object();
    private PluginHost host;
    private boolean alive;
    private ScheduledExecutorService timer;
    private ScheduledFuture<?> pendingPublication;
    private final ArrayDeque<Long> publications = new ArrayDeque<>();
    private long retryDelay = PUBLICATION_WINDOW_MS;
    private Map<String, Object> settings = Collections.emptyMap();
    private final Set<String> subscribed = new LinkedHashSet<>();
    private String weatherEntity = "";
    private String nightEntity = "";
    private Weather weather;
    private Weather.Day forecast;
    private long forecastAt;
    private int forecastRevision;
    private Map<String, Object> nightSnapshot;
    private Boolean nightActive;
    private Map<String, Object> published;
    private String lastStatus;

    @Override public void start(PluginHost host, Map<String, Object> settings) {
        synchronized (lock) {
            this.host = host;
            alive = true;
            timer = Executors.newSingleThreadScheduledExecutor(runnable -> {
                Thread thread = new Thread(runnable, "nightstand-clock");
                thread.setDaemon(true);
                return thread;
            });
            // Weather entities can stay unchanged for hours, and the high and the low change at midnight.
            timer.scheduleWithFixedDelay(() -> {
                synchronized (lock) {
                    if (alive) refreshForecast();
                }
            }, FORECAST_INTERVAL_MS, FORECAST_INTERVAL_MS, TimeUnit.MILLISECONDS);
            configure(settings);
        }
    }

    @Override public void configure(Map<String, Object> settings) {
        synchronized (lock) {
            this.settings = new HashMap<>(settings);
            boolean weatherShown = "Clock and widget".equals(ClockOptions.choice(settings.get("layout"), "Clock and widget", "Clock and widget", "Full screen clock"))
                && "Weather".equals(settings.get("widget"));
            String nextWeather = weatherShown ? ClockOptions.text(settings.get("weatherEntity")) : "";
            String nextNight = "Home Assistant entity".equals(settings.get("nightMode")) ? ClockOptions.text(settings.get("nightEntity")) : "";
            if (!nextWeather.equals(weatherEntity)) {
                weather = null;
                forecast = null;
                forecastAt = 0;
                forecastRevision++;
            }
            if (!nextNight.equals(nightEntity)) {
                nightSnapshot = null;
                nightActive = null;
            }
            weatherEntity = nextWeather;
            nightEntity = nextNight;
            follow();
            // The threshold may have changed while the entity kept its value.
            updateNight();
            publish();
        }
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
        synchronized (lock) {
            String entity = event.substring("ks.ha.entity.".length());
            if (entity.equals(weatherEntity)) {
                weather = Weather.fromSnapshot(payload, today());
                refreshForecast();
            }
            if (entity.equals(nightEntity)) {
                nightSnapshot = payload;
                updateNight();
            }
            publish();
        }
    }

    private void updateNight() {
        // An unavailable entity, such as during a Home Assistant restart, keeps the last known answer.
        Boolean night = isNight(nightSnapshot, ClockOptions.number(settings.get("nightThreshold"), 10, 0, 1000), nightActive);
        if (night != null) nightActive = night;
    }

    private static String today() {
        return Weather.localDate(System.currentTimeMillis());
    }

    /** Today's forecast, from the entity itself or from weather.get_forecasts. Null once its day has passed. */
    private Weather.Day shownForecast() {
        String today = today();
        if (weather != null && weather.today != null && today.equals(weather.today.date)) return weather.today;
        return forecast != null && today.equals(forecast.date) ? forecast : null;
    }

    /**
     * Recent weather entities keep the forecast behind weather.get_forecasts. Ask for it twice an hour, or every few
     * minutes while there is none for today, such as just after midnight or after a failure.
     */
    private void refreshForecast() {
        if (weather == null || weather.today != null) return;
        long now = System.currentTimeMillis();
        long wait = shownForecast() == null ? FORECAST_RETRY_MS : FORECAST_INTERVAL_MS;
        if (forecastAt != 0 && now - forecastAt < wait) return;
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
                synchronized (lock) {
                    if (!alive || revision != forecastRevision) return;
                    if (!ok) {
                        host.log("No daily forecast for " + entity + ": " + error);
                        return;
                    }
                    forecast = Weather.fromForecastResponse(data, entity, today());
                    publish();
                }
            });
        } catch (UnsupportedOperationException e) {
            host.log("This Kiosk Satellite cannot call Home Assistant services, so the forecast stays hidden.");
        }
    }

    /** The margin a numeric entity must climb above the threshold to end the night, so a flickering sensor holds still. */
    static double hysteresis(double threshold) {
        return Math.max(1, threshold * 0.1);
    }

    /**
     * Night for on, true and below_horizon. A number means night below the threshold, and while it is already night,
     * until it climbs past the threshold plus {@link #hysteresis}. Null when HA has no state.
     */
    static Boolean isNight(Map<String, Object> snapshot, double threshold, Boolean current) {
        if (snapshot == null || !"available".equals(snapshot.get("status")) || !(snapshot.get("state") instanceof String)) return null;
        String state = ((String) snapshot.get("state")).trim().toLowerCase(Locale.ROOT);
        Double value = Weather.number(state);
        if (value != null) return value < threshold + (Boolean.TRUE.equals(current) ? hysteresis(threshold) : 0);
        return state.equals("on") || state.equals("true") || state.equals("below_horizon") || state.equals("night");
    }

    /**
     * Publish the current options if they changed, within KS's budget. Over the budget, or when KS refuses, publish the
     * latest state later instead. A refused publication would otherwise end the session.
     */
    private void publish() {
        if (!alive) return;
        Weather.Day today = shownForecast();
        Map<String, Object> options = ClockOptions.options(settings, weather, today, nightActive);
        showStatus(today);
        if (options.equals(published)) {
            cancelPendingPublication();
            return;
        }
        long now = System.currentTimeMillis();
        while (!publications.isEmpty() && now - publications.peekFirst() >= PUBLICATION_WINDOW_MS) publications.pollFirst();
        if (publications.size() >= PUBLICATIONS_PER_WINDOW) {
            publishLater(publications.peekFirst() + PUBLICATION_WINDOW_MS - now);
            return;
        }
        try {
            host.publishScreensaverAsset(KEY, TITLE, ENTRY, options);
        } catch (RuntimeException e) {
            if (!alive) return;
            host.log("Kiosk Satellite refused the screensaver update, trying again: " + e.getMessage());
            publications.addLast(now);
            publishLater(retryDelay);
            retryDelay = Math.min(MAX_RETRY_MS, retryDelay * 2);
            return;
        }
        publications.addLast(now);
        retryDelay = PUBLICATION_WINDOW_MS;
        published = options;
        cancelPendingPublication();
    }

    /** One deferred publication at a time. It reads the state when it runs, so it always sends the latest. */
    private void publishLater(long delay) {
        if (pendingPublication != null && !pendingPublication.isDone()) return;
        pendingPublication = timer.schedule(() -> {
            synchronized (lock) {
                pendingPublication = null;
                publish();
            }
        }, Math.max(1, delay), TimeUnit.MILLISECONDS);
    }

    private void cancelPendingPublication() {
        if (pendingPublication != null) {
            pendingPublication.cancel(false);
            pendingPublication = null;
        }
    }

    private void showStatus(Weather.Day today) {
        StringBuilder status = new StringBuilder("Choose Nightstand Clock under Screensaver > Screensaver mode.");
        if (!weatherEntity.isEmpty()) {
            status.append(weather == null || weather.temperature == null
                ? " Waiting for " + weatherEntity + "."
                : " Weather: " + weather.condition + ", " + Math.round(weather.temperature) + "°"
                    + (today != null ? " (" + Math.round(today.high) + "° / " + Math.round(today.low) + "°)" : "") + ".");
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

    @Override public void stop() throws InterruptedException {
        ScheduledExecutorService ending;
        synchronized (lock) {
            alive = false;
            // KS removes the screensaver and every subscription when the session ends.
            subscribed.clear();
            published = null;
            ending = timer;
            timer = null;
        }
        // Plugin threads must end before stop returns. Wait outside the lock so a running task can finish.
        if (ending != null) {
            ending.shutdownNow();
            ending.awaitTermination(1, TimeUnit.SECONDS);
        }
    }
}
