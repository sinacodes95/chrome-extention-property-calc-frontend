# Property Desk Calc

Property Desk Calc is a Manifest V3 Chrome extension for the sibling [Rust calculator](../chrome-extention-calc-backend). Property analysis opens by default. The toolbar popup gives you quick access, and **Open in a tab** gives wide tables and longer sessions more room.

| Workspace | What you can do |
| --- | --- |
| Property | Underwrite a deal's first year, project annual cash flow and sale returns, and compare rent growth and exit cap rates. Enter loan terms or model an all-cash purchase. The form starts with the backend's worked example. |
| Finance | Calculate NPV and IRR from periodic cash flows, or view payments, balances and totals for a fixed-rate loan. |
| Scientific | Type expressions or use the keypad and function picker. Choose degrees or radians. |

Enter rates as percentages in the property and finance forms (for example, enter `8` for 8%). Amounts have no currency symbol; use the same currency throughout a calculation. Draft inputs stay on your device for the current Chrome session, so you can reopen the popup or continue in a tab.

## See a deal in action

These screenshots follow the built-in example of a commercial property with a purchase price of 2,000,000. The local preview runs each calculation through the Rust backend.

### Underwrite the first year

Enter rent, vacancy, operating expenses and loan terms. The example shows **160,800 in net operating income**, an **8.04% cap rate** and **60,371.40 in cash flow after debt**. The results also show how much occupancy the deal needs to break even and how well operating income covers debt payments.

![Year-one underwriting with the deal and loan inputs beside net operating income, cap rate, cash flow and financing ratios](docs/screenshots/year-one.png)

### Project cash flow and sale proceeds

Model a five-year hold and compare returns with and without financing. The example projects an **11.13% levered IRR** and a **1.6× equity multiple**. The cash flow table shows the initial outlay, each year's cash flow and the proceeds from sale in the final year.

![Five-year property projection with return metrics, sale proceeds, loan payoff and annual cash flows](docs/screenshots/projection.png)

### Test how assumptions affect returns

Compare rent growth and exit cap rates in one grid. Across these nine scenarios, the example's **levered IRR ranges from −3.13% to 20.56%**. Switch the grid to NPV or gross sale price to compare those outcomes on the same assumptions.

![Sensitivity grid comparing three rent growth assumptions with three exit cap rates, with levered IRR in each cell](docs/screenshots/sensitivity.png)

<details>
<summary>See the finance and scientific calculators</summary>

**Finance.** Check the next monthly payment, remaining balance, and principal and interest paid after a year. The same workspace also calculates NPV and IRR from periodic cash flows.

![Fixed-rate loan calculator showing payment, remaining balance, and principal and interest paid after 12 payments](docs/screenshots/loan.png)

**Scientific.** Type an expression or use the keypad and function picker. The calculation shown in degrees returns 126.5, matching the API example below.

![Scientific calculator showing an expression in degrees, its result of 126.5, and the available functions](docs/screenshots/scientific.png)

</details>

## Load your own version of the extension

I'll share the infrastructure code (written in cloud-formation) next, if I forget to come back here and link it then look at the repositories on my github you should be able to find it there. Alternatively, shout my name out in the streets and if I'm close enough to hear you the I'll should back the URL for the infrastructure repo :D. 

1. Open `chrome://extensions`, turn on **Developer mode**, then click **Load unpacked** and select this repository.
2. Open **Property Desk Calc** from Chrome's Extensions menu. Click **Set up connection** and enter the full HTTPS URL for the API Gateway POST route.
3. Save and approve Chrome's access prompt for that host. Use **Test connection** to verify that the route returns the expected result.

The extension needs no build step. The AWS endpoint is not deployed by this repository. With no endpoint, the installed extension can be explored but cannot calculate.

## Develop against the real Rust calculator

Use Node.js 20 or later. If the Rust CLI is not already built, run `cargo build --locked` in the backend repository.

```sh
npm run dev
npm test
```

Open [the local preview](http://127.0.0.1:4173/), or use [popup dimensions](http://127.0.0.1:4173/?mode=popup). The server starts on loopback and sends calculation requests to the existing Rust CLI. It looks for the sibling debug binary by default; set `CALCULATOR_BIN` to use another build. Set `CALCULATOR_DEV_PORT` to change the port. The API contract tests run against the CLI when it is available.

Use `npm run package` on a machine with the `zip` command to make `dist/property-desk-calc.zip`. The archive contains the runtime files and license.

## API Gateway contract for the AWS Lambda function

Expose one HTTPS POST route. Property Desk Calc sends the Rust request as the JSON body, including its `operation` tag. For example:

```json
{"operation":"evaluate","expression":"sin(30) + log(64, 2) + 5!","angle_mode":"degrees"}
```

The Lambda should pass the decoded event body to `rust_calculator::calculate_json` and return the resulting string as the proxy response's `body`, with `Content-Type: application/json` and `isBase64Encoded: false`. API Gateway forwards that body to the extension. The client expects one of the Rust envelopes, directly in the HTTP response:

```json
{"ok":true,"result":{"value":126.5}}
{"ok":false,"error":{"code":"domain","message":"…"}}
```

Use a 2xx status for successful results; structured calculator errors can use 4xx. Keep the backend's 64 KiB request limit and preserve `null` ratios and IRRs and per-scenario errors. See the [API Gateway Lambda proxy response format](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html#http-api-develop-integrations-lambda.response) and [Chrome's host access model](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests).

The extension posts inputs only to the URL you configure. It requests access to that HTTPS host on save, saves the URL on the device, and sends no AWS credentials, cookies or API keys. The route must accept this client as configured; if it requires authentication, implement a client sign-in flow before deploying it for those users. Do not put AWS secrets in extension files or in the endpoint URL.
