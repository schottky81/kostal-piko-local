# Kostal PIKO (Local) for Homey Pro

Local Homey Pro app skeleton that reads values from Kostal PIKO over:

- `GET /api/dxs.json?dxsEntries=...`

No authentication is used in this version.

## Implemented capabilities

- `measure_power` (DXS `67109120`)
- `meter_power` (DXS `251658753`)
- `measure_frequency` (DXS `67110400`)
- `measure_voltage` (DXS `67109378`)
- `measure_current` (DXS `67109377`)
- `alarm_generic` (communication failures)

Metadata is stored in the device store (`metadata`):

- inverter name (`16777984`)
- serial number (`16777728`)
- firmware version (`16779265`)
- operating status (`16780032`)

## Configure

Device settings:

- host (IP or DNS name)
- fast polling interval
- slow polling interval
- request timeout
- failures before unavailable

## Run locally

1. Install Homey CLI if needed.
2. Open this folder.
3. Run the app in debug mode:

```powershell
homey app run
```

4. Pair device `Kostal PIKO` in Homey.
5. Set inverter host to your local IP.
