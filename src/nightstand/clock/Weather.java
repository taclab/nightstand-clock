// SPDX-License-Identifier: Apache-2.0
package nightstand.clock;

import java.util.List;
import java.util.Map;

/** The few weather fields the page shows, read from Home Assistant snapshots and forecasts. */
final class Weather {
    final String name;
    final String condition;
    final Double temperature;
    final String unit;
    final Double high;
    final Double low;

    Weather(String name, String condition, Double temperature, String unit, Double high, Double low) {
        this.name = name;
        this.condition = condition;
        this.temperature = temperature;
        this.unit = unit;
        this.high = high;
        this.low = low;
    }

    Weather withForecast(Double high, Double low) {
        return new Weather(name, condition, temperature, unit, high, low);
    }

    /** A ks.ha.entity snapshot, or null when HA has no current state for it. */
    static Weather fromSnapshot(Map<String, Object> snapshot) {
        if (snapshot == null || !"available".equals(snapshot.get("status"))) return null;
        Object state = snapshot.get("state");
        Map<?, ?> attributes = snapshot.get("attributes") instanceof Map ? (Map<?, ?>) snapshot.get("attributes") : null;
        if (!(state instanceof String) || attributes == null) return null;
        Double[] today = today(attributes.get("forecast"));
        return new Weather(string(attributes.get("friendly_name")), (String) state,
            number(attributes.get("temperature")), string(attributes.get("temperature_unit")), today[0], today[1]);
    }

    /** The response of weather.get_forecasts for one entity: today's high and low, or nulls. */
    static Double[] fromForecastResponse(Object result, String entityId) {
        if (!(result instanceof Map)) return new Double[2];
        Object response = ((Map<?, ?>) result).get("response");
        if (!(response instanceof Map)) return new Double[2];
        Object entity = ((Map<?, ?>) response).get(entityId);
        return entity instanceof Map ? today(((Map<?, ?>) entity).get("forecast")) : new Double[2];
    }

    /** The first daily entry has the high in temperature and the low in templow. */
    static Double[] today(Object forecast) {
        Double[] result = new Double[2];
        if (!(forecast instanceof List) || ((List<?>) forecast).isEmpty()) return result;
        Object first = ((List<?>) forecast).get(0);
        if (!(first instanceof Map)) return result;
        result[0] = number(((Map<?, ?>) first).get("temperature"));
        result[1] = number(((Map<?, ?>) first).get("templow"));
        return result;
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
