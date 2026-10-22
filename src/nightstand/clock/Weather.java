// SPDX-License-Identifier: Apache-2.0
package nightstand.clock;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** The few weather fields the page shows, read from Home Assistant snapshots and forecasts. */
final class Weather {
    /** One day of a daily forecast. The date is the yyyy-MM-dd the provider wrote in the entry's datetime. */
    static final class Day {
        final String date;
        final Double high;
        final Double low;

        Day(String date, Double high, Double low) {
            this.date = date;
            this.high = high;
            this.low = low;
        }
    }

    final String name;
    final String condition;
    final Double temperature;
    final String unit;
    /** Today from the entity's own forecast attribute, which only older integrations still fill. */
    final Day today;

    Weather(String name, String condition, Double temperature, String unit, Day today) {
        this.name = name;
        this.condition = condition;
        this.temperature = temperature;
        this.unit = unit;
        this.today = today;
    }

    /** Today's date on the device, as forecast entries spell it. */
    static String localDate(long millis) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).format(new Date(millis));
    }

    /** A ks.ha.entity snapshot, or null when HA has no current state for it. */
    static Weather fromSnapshot(Map<String, Object> snapshot, String today) {
        if (snapshot == null || !"available".equals(snapshot.get("status"))) return null;
        Object state = snapshot.get("state");
        Map<?, ?> attributes = snapshot.get("attributes") instanceof Map ? (Map<?, ?>) snapshot.get("attributes") : null;
        if (!(state instanceof String) || attributes == null) return null;
        return new Weather(string(attributes.get("friendly_name")), (String) state,
            number(attributes.get("temperature")), string(attributes.get("temperature_unit")), day(attributes.get("forecast"), today));
    }

    /** The response of weather.get_forecasts for one entity: the entry for today, or null. */
    static Day fromForecastResponse(Object result, String entityId, String today) {
        if (!(result instanceof Map)) return null;
        Object response = ((Map<?, ?>) result).get("response");
        if (!(response instanceof Map)) return null;
        Object entity = ((Map<?, ?>) response).get(entityId);
        return entity instanceof Map ? day(((Map<?, ?>) entity).get("forecast"), today) : null;
    }

    /**
     * The daily entry whose datetime starts with today's date. Providers write the day an entry is about, such as
     * 2026-10-22T00:00:00+00:00 or 2026-10-22T12:00:00-05:00, so the date is read as written, not converted. An entry
     * without the high and the low counts as missing.
     */
    static Day day(Object forecast, String today) {
        if (!(forecast instanceof List)) return null;
        for (Object entry : (List<?>) forecast) {
            if (!(entry instanceof Map)) continue;
            Object datetime = ((Map<?, ?>) entry).get("datetime");
            if (!(datetime instanceof String) || !((String) datetime).startsWith(today)) continue;
            Double high = number(((Map<?, ?>) entry).get("temperature"));
            Double low = number(((Map<?, ?>) entry).get("templow"));
            return high == null || low == null ? null : new Day(today, high, low);
        }
        return null;
    }

    static Double number(Object value) {
        if (value instanceof Number && Double.isFinite(((Number) value).doubleValue())) return ((Number) value).doubleValue();
        if (value instanceof String) {
            try {
                double parsed = Double.parseDouble(((String) value).trim());
                return Double.isFinite(parsed) ? parsed : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static String string(Object value) {
        return value instanceof String ? (String) value : null;
    }
}
