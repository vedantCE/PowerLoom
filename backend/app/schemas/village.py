from pydantic import BaseModel, Field, model_validator


class Location(BaseModel):
    name: str
    district: str
    state: str
    latitude: float
    longitude: float


class SolarConfig(BaseModel):
    capacity_kw: float = Field(ge=0)
    system_loss: float = 0.14
    temp_coeff_per_c: float = -0.004


class WindConfig(BaseModel):
    capacity_kw: float = Field(ge=0)
    cut_in_ms: float = 3.0
    rated_ms: float = 11.0
    cut_out_ms: float = 25.0
    hub_height_m: float = 30


class BatteryConfig(BaseModel):
    capacity_kwh: float = Field(ge=0)
    soc_min: float = 0.2
    soc_max: float = 1.0
    soc_initial: float = 0.5
    max_charge_kw: float = Field(ge=0)
    max_discharge_kw: float = Field(ge=0)
    eff_charge: float = 0.95
    eff_discharge: float = 0.95
    wear_cost_inr_per_kwh: float = 2.0

    @model_validator(mode="after")
    def _check_soc_bounds(self) -> "BatteryConfig":
        if not (self.soc_min < self.soc_initial <= self.soc_max):
            raise ValueError("soc_min must be < soc_initial <= soc_max")
        return self


class DieselConfig(BaseModel):
    capacity_kw: float = Field(ge=0)
    min_load_frac: float = 0.3
    fuel_intercept_l_per_h_per_kw: float = 0.08145
    fuel_slope_l_per_kwh: float = 0.246
    fuel_price_inr_per_l: float = 90.0
    co2_kg_per_l: float = 2.68


class EconomicsConfig(BaseModel):
    co2_penalty_inr_per_kg: float = 2.0
    shed_penalty_inr_per_kwh: float = 100.0


class DemandComponent(BaseModel):
    name: str
    category: str
    critical: bool
    quantity: int = Field(ge=0)
    rated_w: float = Field(ge=0)
    usage_factor: float = Field(ge=0, le=1)
    schedule: list[tuple[int, int]]

    @model_validator(mode="after")
    def _check_schedule(self) -> "DemandComponent":
        for start_hour, end_hour in self.schedule:
            if not (0 <= start_hour < end_hour <= 24):
                raise ValueError(
                    f"schedule window [{start_hour}, {end_hour}) must satisfy "
                    "0 <= start_hour < end_hour <= 24"
                )
        return self


class VillageConfig(BaseModel):
    id: str
    location: Location
    solar: SolarConfig
    wind: WindConfig
    battery: BatteryConfig
    diesel: DieselConfig
    economics: EconomicsConfig
    demand_components: list[DemandComponent]


class PresetSummary(BaseModel):
    id: str
    name: str
    district: str
    state: str
    solar_kw: float
    wind_kw: float
    battery_kwh: float
    diesel_kw: float
