"""Generation service to convert weather forecasts into solar and wind generation profiles."""

from app.schemas.village import VillageConfig
from app.services.forecast.models import WeatherForecast
from app.services.generation.models import GenerationProfile, HourlyGeneration
from app.services.generation.solar import (
    calculate_cell_temp,
    calculate_poa_irradiance,
    calculate_solar_power,
)
from app.services.generation.wind import (
    calculate_hub_wind_speed,
    calculate_wind_power,
)


def build_generation_profile(
    village: VillageConfig,
    forecast: WeatherForecast,
) -> GenerationProfile:
    """Build an hourly generation profile from a village config and weather forecast."""
    hourly_generations: list[HourlyGeneration] = []

    for hour in forecast.hours:
        poa = calculate_poa_irradiance(hour.ghi_wm2, hour.gti_wm2)
        cell_temp = calculate_cell_temp(hour.temp_c, poa)
        solar_kw = calculate_solar_power(
            capacity_kw=village.solar.capacity_kw,
            poa_wm2=poa,
            cell_temp_c=cell_temp,
            system_loss=village.solar.system_loss,
            temp_coeff_per_c=village.solar.temp_coeff_per_c,
        )

        hub_v = calculate_hub_wind_speed(
            wind_speed_80m_ms=hour.wind_speed_80m_ms,
            wind_speed_10m_ms=hour.wind_speed_10m_ms,
            hub_height_m=village.wind.hub_height_m,
        )
        wind_kw = calculate_wind_power(
            capacity_kw=village.wind.capacity_kw,
            hub_wind_speed_ms=hub_v,
            cut_in_ms=village.wind.cut_in_ms,
            rated_ms=village.wind.rated_ms,
            cut_out_ms=village.wind.cut_out_ms,
        )

        hourly_generations.append(
            HourlyGeneration(
                timestamp=hour.timestamp,
                solar_available_kw=round(solar_kw, 3),
                wind_available_kw=round(wind_kw, 3),
                poa_irradiance_wm2=round(poa, 2),
                cell_temp_c=round(cell_temp, 2),
                hub_wind_speed_ms=round(hub_v, 2),
            )
        )

    horizon = forecast.horizon_hours if forecast.horizon_hours > 0 else len(hourly_generations)
    total_solar_kwh = round(sum(h.solar_available_kw for h in hourly_generations), 3)
    total_wind_kwh = round(sum(h.wind_available_kw for h in hourly_generations), 3)

    if village.solar.capacity_kw > 0 and horizon > 0:
        solar_cf = round(total_solar_kwh / (village.solar.capacity_kw * horizon), 4)
    else:
        solar_cf = 0.0

    if village.wind.capacity_kw > 0 and horizon > 0:
        wind_cf = round(total_wind_kwh / (village.wind.capacity_kw * horizon), 4)
    else:
        wind_cf = 0.0

    return GenerationProfile(
        village_id=village.id,
        horizon_hours=horizon,
        forecast_source=forecast.source,
        hours=hourly_generations,
        total_solar_kwh=total_solar_kwh,
        total_wind_kwh=total_wind_kwh,
        solar_capacity_factor=solar_cf,
        wind_capacity_factor=wind_cf,
    )
