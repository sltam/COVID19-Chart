// Data
const WORLD = "World";
const $localeData = {}; // $localeData[localeName][date][key]
const $countries = { [WORLD]: [] };
const $provinces = {};
const $areas = {};
let $dates;
let $coronaChart;
let $countrySelect;

let $requestsPending = 0;

// Properties
let _logScale;
let _alignment;
let _selectedCountries;
let _selectedCaseKinds;


function CalculateWorldData() {
    $localeData[WORLD] = [];
    for (const dayIndex in $dates) {
        let confirmed = 0, deaths = 0;
        for (const country in $countries) {
            // if (!$localeData[country])  console.info(`Missing $localeData[${country}]`);
            const localeData = $localeData[country] || [];
            confirmed += (localeData[dayIndex] || {}).Confirmed || 0;
            deaths += (localeData[dayIndex] || {}).Deaths || 0;
        }
        $localeData[WORLD][dayIndex] = { Confirmed: confirmed, Deaths: deaths };
    }
}

function CalculateIncrease() {
    for (const locale in $localeData) {
        const localeData = $localeData[locale];
        if (!localeData || !localeData[0]) continue;
        let last = localeData[0].Confirmed;
        for (const dayIndex in localeData) {
            const current = localeData[dayIndex].Confirmed;
            if (last > 0) {
                localeData[dayIndex].New = current - last;
                localeData[dayIndex].Growth = Math.round(10000 * (current - last) / last) / 100;
            }
            last = current;
        }
    }
}

function PopulateSelectPicker() {
    $countrySelect.contents().remove();
    for (const [country, countryMetadata] of Object.entries($countries)) {
        const locales = [...countryMetadata.Provinces || [], ...countryMetadata.Areas || []];
        if (locales.length > 0) {
            locales.sort();
            const optgroup = $("<optgroup>").attr("label", country);
            optgroup.append($("<option>").text(country));
            for (const locale of locales) {
                optgroup.append($("<option>").text(locale));
            }
            $countrySelect.append(optgroup);
        } else {
            $countrySelect.append($("<option>").text(country));
        }
    }
    $countrySelect.selectpicker("refresh");
}

function ClearChartData() {
    $coronaChart.data.datasets = [];
}

function UpdateChartData() {
    const colorForCaseKind = {
        Confirmed: "hsl(%d, 70%, 70%, 0.7)",
        Deaths: "hsl(%d, 70%, 30%, 0.5)",
        New: "hsl(%d, 50%, 50%, 1.0)",
        Growth: "hsl(%d, 30%, 70%, 1.0)",
    };
    const pointStylesForCaseKind = {
        Confirmed: "circle",
        Deaths: "crossRot",
        New: "star",
        Growth: "triangle",
    };

    const datasets = $coronaChart.data.datasets;
    const datasetByID = {};
    datasets.forEach(dataset => datasetByID[dataset.id] = dataset);
    datasets.splice(0, datasets.length);
    let maxLength = 0;
    let maxValue = 0;
    let shift = 0; // Number of initial entries to drop
    if (_alignment == "last28") {
        shift = $dates.length - 28;
    }
    for (const [countryIndex, country] of _selectedCountries.entries()) {
        if (_alignment == "since100") {
            shift = $localeData[country].filter(x => x.Confirmed < 100).length;
        }
        for (const caseKind of _selectedCaseKinds) {
            const id = `${country}-${caseKind}`;
            const suffix = _selectedCaseKinds.length == 1 ? "" : `-${caseKind}`;
            const cases = ([...$localeData[country]]).map(x => (x ? x[caseKind] : NaN));
            const color = colorForCaseKind[caseKind].replace("%d", countryIndex * 360 / _selectedCountries.length);
            const pointStyle = pointStylesForCaseKind[caseKind];
            const dataset = {
                backgroundColor: color,
                borderColor: color,
                borderWidth: 1,
                data: cases,
                fill: false,
                label: `${country}${suffix}`,
                lineTension: 0,
                pointBackgroundColor: color,
                pointStyle,
            };
            dataset.yAxisID = caseKind == "Growth" ? "yRight" : "yLeft";
            dataset.id = id;
            dataset.data = dataset.data.slice(shift);
            const existingDataSet = datasetByID[id];
            if (existingDataSet) {
                for (const prop in dataset) {
                    existingDataSet[prop] = dataset[prop];
                }
                datasets.push(existingDataSet);
                delete datasetByID[id];
            } else {
                datasets.push(dataset);
            }
            maxLength = Math.max(maxLength, dataset.data.length);
            maxValue = Math.max(maxValue, Math.max(...dataset.data));
        }
    }

    if (_alignment == "all") {
        $coronaChart.data.labels = $dates.map(s => s.split("/").slice(0, 2).join("/"));
    } else if (_alignment == "last28") {
        $coronaChart.data.labels = $dates.slice(shift);
    } else {
        $coronaChart.data.labels = [...Array(maxLength).keys()]; // 1 to maxLength
    }
    $coronaChart.options.scales["yLeft"].ticks.max = _logScale ? Math.pow(10, Math.ceil(Math.log10(maxValue))) : undefined;
    $coronaChart.options.scales["yRight"].display = _selectedCaseKinds.includes("Growth");
    $coronaChart.update();
}

function CreateChart() {
    let ctx = document.getElementById("coronaChart");

    $coronaChart = new Chart(ctx, {
        type: "line",
        fill: false,
        data: {
            labels: [],
            datasets: [],
        },
        options: {
            legend: {
                display: true,
                position: "right",
            },
            scales: {
                "yLeft": {
                    id: "yLeft",
                    scaleLabel: {
                        display: true,
                        labelString: "# of people",
                    },
                    ticks: {
                        beginAtZero: true,
                        maxTicksLimit: 12,
                    },
                    type: "linear",
                    position: "left",
                },
                "yRight": {
                    id: "yRight",
                    scaleLabel: {
                        display: true,
                        labelString: "%increase",
                    },
                    ticks: {
                        min: 0,
                    },
                    type: "linear",
                    position: "right",
                }
            }
        }
    });
}

function CreateChartWhenDataReady() {
    if ($requestsPending > 0) {
        return;
    }

    CalculateWorldData();
    CalculateIncrease();
    PopulateSelectPicker();
    PopulateDefaultsFromURL();

    CreateChart();
    ChartScaleUpdated();
    CaseKindUpdated();
    AlignmentUpdated();

    $countrySelect.selectpicker("val", _selectedCountries);
    UpdateChartData();
}

function UpdateButton(button, value) {
    button.prop("checked", value);
    if (value) {
        button.parent().addClass("active");
    } else {
        button.parent().removeClass("active");
    }
}

function SelectCountries(countries) {
    $countrySelect.selectpicker("val", countries);
}

function PopulateDefaultsFromURL() {
    const url = new URL(window.location);
    const searchParams = url.searchParams;
    if (searchParams.get("locales")) {
        _selectedCountries = searchParams.get("locales").split("|").filter(locale => {
            const selected = !!$localeData[locale];
            if (!selected) console.log(`Dropped missing locale: ${locale}`);
            return selected;
        });
    } else {
        _selectedCountries = GetTopCountries(10);
    }
    _selectedCaseKinds = (searchParams.get("casekinds") || "Confirmed").split("|");
    _logScale = searchParams.get("scale") != "linear";
    _alignment = searchParams.get("alignment") || "all";
    UpdateButton($("#logarithmic"), _logScale);
    UpdateButton($("#linear"), !_logScale);
    UpdateButton($("#confirmed"), _selectedCaseKinds.includes("Confirmed"));
    UpdateButton($("#deaths"), _selectedCaseKinds.includes("Deaths"));
    UpdateButton($("#new"), _selectedCaseKinds.includes("New"));
    UpdateButton($("#growth"), _selectedCaseKinds.includes("Growth"));
    UpdateButton($("#all"), _alignment == "all");
    UpdateButton($("#last28"), _alignment == "last28");
    UpdateButton($("#since100"), _alignment == "since100");
}

function UpdateURL() {
    const url = new URL(window.location);
    url.search = "";
    const searchParams = url.searchParams;
    searchParams.set("locales", _selectedCountries.join("|"));
    searchParams.set("casekinds", _selectedCaseKinds.join("|"));
    searchParams.set("scale", _logScale ? "log" : "linear");
    searchParams.set("alignment", _alignment);
    window.history.replaceState({}, document.title, url.toString());
}

function ChartScaleUpdated() {
    _logScale = $("#logarithmic").prop("checked")
    if (_logScale) {
        $coronaChart.options.scales["yLeft"].type = "logarithmic";
    } else {
        $coronaChart.options.scales["yLeft"].type = "linear";
    }
    UpdateChartData();
    UpdateURL();
}

function CaseKindUpdated() {
    _selectedCaseKinds.splice(0, _selectedCaseKinds.length);
    if ($("#confirmed").prop("checked")) {
        _selectedCaseKinds.push("Confirmed");
    }
    if ($("#deaths").prop("checked")) {
        _selectedCaseKinds.push("Deaths");
    }
    if ($("#new").prop("checked")) {
        _selectedCaseKinds.push("New");
    }
    if ($("#growth").prop("checked")) {
        _selectedCaseKinds.push("Growth");
    }
    UpdateChartData();
    UpdateURL();
}

function AlignmentUpdated() {
    const alignment = $("#all").prop("checked") ? "all" : $("#last28").prop("checked") ? "last28" : "since100";
    if (_alignment != alignment) {
        ClearChartData();
    }
    _alignment = alignment;
    UpdateChartData();
    UpdateURL();
}

function GetTopCountries(count) {
    const countries = Object.keys($countries).filter(x => x != WORLD);
    const maxPerCountry = countries.map(x => [ x, ((($localeData[x] || []).slice(-1))[0] || {}).Confirmed || 0 ]);
    maxPerCountry.sort((a, b) => b[1] - a[1]);
    return [WORLD, ...maxPerCountry.slice(0, count).map(x => x[0])];
}

function GetTopProvinces(count, country) {
    const provinces = $countries[country].Provinces;
    const maxPerCountry = provinces.map(x => [ x, ((($localeData[x] || []).slice(-1))[0] || {}).Confirmed || 0 ]);
    maxPerCountry.sort((a, b) => b[1] - a[1]);
    return [country, ...maxPerCountry.slice(0, count).map(x => x[0])];
}


// This is only used for detailed data. We assume country data are pre-filled via time series.
function StoreLocaleData(provinceFullName, dayIndex, key, datum) {
    const provinceData = $localeData[provinceFullName] = $localeData[provinceFullName] || [];
    const dayData = provinceData[dayIndex] = provinceData[dayIndex] || { Confirmed: 0, Deaths: 0 };
    dayData[key] += datum;
}

function StoreTimeSeriesData(key, table) {
    const rows = table.slice(1).filter(row => row.length > 1);
    for (const row of rows) {
        let [province, country, lat, long] = row;
        country = country ? country.trim() : null;
        province = province ? province.trim() : null;
        if (country == "Korea, South") country = "South Korea";
        if (country == "Taiwan*") country = "Taiwan";
        if (province == "Hong Kong" || province == "Macau") [country, province] = [province, null];
        if (province && country == "US") province = null;
        $countries[country] = $countries[country] || { Provinces: [], Areas: [] };

        const fullName = `${country}>${province}`;
        if (province && !/^\W*$/.test(province) && !$countries[fullName] && !$provinces[fullName]) {
            $provinces[fullName] = { Country: country, Name: province, FullName: fullName };
            $countries[country].Provinces.push(fullName);
        }

        const provinceData = $localeData[fullName] = $localeData[fullName] || [];
        const countryData = $localeData[country] = $localeData[country] || [];
        for (const [dayIndex, datum] of row.slice(4).entries()) {
            provinceData[dayIndex] = provinceData[dayIndex] || { Confirmed: 0, Deaths: 0 };
            provinceData[dayIndex][key] += datum;
            countryData[dayIndex] = countryData[dayIndex] || { Confirmed: 0, Deaths: 0 };
            countryData[dayIndex][key] += datum;
        }
    }
}

function ProcessPerDayData(dateString, dayIndex, results) {
    --$requestsPending;
    if (results.errors.length) throw new Error(results.errors);
    const data = results.data;
    const cols = data.shift();
    for (const row of data) {
        if (row.length <= 1) continue;
        const dict = {};
        for (const [colIndex, name] of cols.entries()) {
            dict[name.replace(/[_\/ ]/g, "")] = row[colIndex];
        }
        // if (dict["Admin2"]) continue;
        let area = dict["Admin2"];
        let province = dict["ProvinceState"];
        let country = dict["CountryRegion"];
        if (province == country) province = null;
        if (!province) continue; // Country data are already reported in time series, so skip here.

        if (country == "Mainland China") country = "China";
        if (province == "Hong Kong") [province, country] = [null, "Hong Kong"];
        if (province == "Macau") [province, country] = [null, "Macau"];
        if (province == "Taiwan") [province, country] = [null, "Taiwan"];
        if (province == "Cruise Ship") [province, country] = [null, "Cruise Ship"];
        if (province == "Diamond Princess") [province, country] = [null, "Diamond Princess"];
        if (province == "Diamond Princess cruise ship") [province, country] = [null, "Diamond Princess"];
        if (country == "US") province = StateMapping()[province] || province;
        if (country != "US") continue; // For now, because the rest aren't that working.
        if (!province) continue; // Skip those Diamond Princess

        const match = province.match(/(.*), (\w\w)/);
        if (match) [area, province] = [match[1], match[2]];
        if (area) area = area.replace(/ County$/, "");

        if (!$countries[country]) { console.info(`Country not previous seen in time series: ${country}`, row); continue; }

        const provinceFullName = `${country}>${province}`;
        const fullName = provinceFullName + (area ? `>${area}` : "");
        if (province && !$provinces[provinceFullName]) {
            $provinces[provinceFullName] = { Country: country, Name: province, FullName: provinceFullName, Areas: [] };
            $countries[country].Provinces.push(provinceFullName);
        }
        if (province && area && !$areas[fullName]) {
            $areas[fullName] = { Country: country, Province: provinceFullName, Name: area, FullName: fullName };
            $provinces[provinceFullName].Areas.push(fullName);
            $countries[country].Areas.push(fullName);
        }

        StoreLocaleData(provinceFullName, dayIndex, "Confirmed", dict["Confirmed"]);
        StoreLocaleData(provinceFullName, dayIndex, "Deaths", dict["Deaths"]);
        if (area) {
            StoreLocaleData(fullName, dayIndex, "Confirmed", dict["Confirmed"]);
            StoreLocaleData(fullName, dayIndex, "Deaths", dict["Deaths"]);
        }
    }
    CreateChartWhenDataReady();
}

function RequestPerDayData() {
    for (const [dayIndex, dateString] of $dates.entries()) {
        const [m, d] = dateString.split("/");
        const filename = `${m.padStart(2, "0")}-${d.padStart(2, "0")}-2020.csv`;
        ++$requestsPending;
        Papa.parse(`https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_daily_reports/${filename}`, { download: true, dynamicTyping: true, complete: results => ProcessPerDayData(dateString, dayIndex, results) });
    }
}

$(document).ready(function() {
    $countrySelect = $("#country-select");
    $countrySelect.selectpicker();
    $countrySelect.on("changed.bs.select", function (e, clickedIndex, isSelected, previousValue) {
        _selectedCountries = $countrySelect.val();
        UpdateURL();
        UpdateChartData();
    });

    $("#scale").change(ChartScaleUpdated);
    $("#caseKind").change(CaseKindUpdated);
    $("#alignment").change(AlignmentUpdated);
    $("#world").click(() => $countrySelect.selectpicker("val", [WORLD]));
    $("#top10").click(() => SelectCountries(GetTopCountries(10)));
    $("#top25").click(() => SelectCountries(GetTopCountries(25)));
    $("#topUS").click(() => SelectCountries(GetTopProvinces(10, "US")));
    $("#topCN").click(() => SelectCountries(GetTopProvinces(10, "China")));
    $("#topAU").click(() => SelectCountries(GetTopProvinces(10, "Australia")));
    $("#topCA").click(() => SelectCountries(GetTopProvinces(10, "Canada")));
    $("#topFR").click(() => SelectCountries(GetTopProvinces(10, "France")));
    $("#topGB").click(() => SelectCountries(GetTopProvinces(10, "United Kingdom")));

    ++$requestsPending;
    Papa.parse("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv", 
        {
            download: true,
            dynamicTyping: true,
            complete: function(results) {
                --$requestsPending;
                if (results.errors.length) throw new Error(results.errors);
                $dates = results.data[0].slice(4); // All available dates
                StoreTimeSeriesData("Confirmed", results.data);
                RequestPerDayData();
                // CreateChartWhenDataReady();
            }
        }
    );

    ++$requestsPending;
    Papa.parse("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv", 
        {
            download: true,
            dynamicTyping: true,
            complete: function(results) {
                --$requestsPending;
                if (results.errors.length) throw new Error(results.errors);
                StoreTimeSeriesData("Deaths", results.data);
                CreateChartWhenDataReady();
            }
        }
    );
});

function StateMapping() {
    return {
        "Alabama": "AL",
        "Alaska": "AK",
        "Arizona": "AZ",
        "Arkansas": "AR",
        "California": "CA",
        "Colorado": "CO",
        "Connecticut": "CT",
        "Delaware": "DE",
        "Florida": "FL",
        "Georgia": "GA",
        "Hawaii": "HI",
        "Idaho": "ID",
        "Illinois": "IL",
        "Indiana": "IN",
        "Iowa": "IA",
        "Kansas": "KS",
        "Kentucky": "KY",
        "Louisiana": "LA",
        "Maine": "ME",
        "Maryland": "MD",
        "Massachusetts": "MA",
        "Michigan": "MI",
        "Minnesota": "MN",
        "Mississippi": "MS",
        "Missouri": "MO",
        "Montana": "MT",
        "Nebraska": "NE",
        "Nevada": "NV",
        "New Hampshire": "NH",
        "New Jersey": "NJ",
        "New Mexico": "NM",
        "New York": "NY",
        "North Carolina": "NC",
        "North Dakota": "ND",
        "Ohio": "OH",
        "Oklahoma": "OK",
        "Oregon": "OR",
        "Pennsylvania": "PA",
        "Rhode Island": "RI",
        "South Carolina": "SC",
        "South Dakota": "SD",
        "Tennessee": "TN",
        "Texas": "TX",
        "Utah": "UT",
        "Vermont": "VT",
        "Virginia": "VA",
        "Washington": "WA",
        "West Virginia": "WV",
        "Wisconsin": "WI",
        "Wyoming": "WY",
        "District of Columbia": "DC",
    };
}