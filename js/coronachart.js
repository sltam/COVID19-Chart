// Data
const WORLD = "World";
const $localeData = {}; // $localeData[localeName][date][key]
const $countries = { [WORLD]: [] };
const $provinces = {};
let $dates;
let $coronaChart;
let $countrySelect;

let $requestsPending = 0;

// Properties
let _logScale;
let _alignment;
let _selectedCountries;
let _selectedCaseKinds;


function StoreDatesAndCountries(csvData) {
    const header = csvData.shift();
    $dates = header.slice(4); // All available dates
    const rows = csvData.filter(row => row.length >= 4);
    for (const row of rows) {
        const [province, country, lat, long] = row;
        $countries[country] = { Provinces: [] };
    }
    for (const row of rows) {
        const [province, country, lat, long] = row;
        const fullName = `${province}, ${country}`;
        if (province == null || /^\W*$/.test(province) || $countries[fullName]) continue;
        $provinces[fullName] = { Country: country, Name: province, FullName: fullName };
        $countries[country].Provinces.push(fullName);
    }
}

function StoreLocaleData(key, csvData) {
    csvData = csvData.slice(1); // Drop header
    for (const row of csvData.slice(1)) {
        const [province, country, lat, long] = row;
        const fullName = `${province}, ${country}`;
        $localeData[fullName] = $localeData[fullName] || [];
        $localeData[country] = $localeData[country] || [];
        for (const [dayIndex, datum] of row.slice(4).entries()) {
            $localeData[fullName][dayIndex] = $localeData[fullName][dayIndex] || { Confirmed: 0, Deaths: 0 };
            $localeData[fullName][dayIndex][key] += datum;
            $localeData[country][dayIndex] = $localeData[country][dayIndex] || { Confirmed: 0, Deaths: 0 };
            $localeData[country][dayIndex][key] += datum;
        }
    }
}

function CalculateWorldData() {
    $localeData[WORLD] = [];
    for (const dayIndex in $dates) {
        let confirmed = 0, deaths = 0;
        for (const country in $countries) {
            // if (!$localeData[country])  console.info(`Missing $localeData[${country}]`);
            const localeData = $localeData[country] || {};
            confirmed += (localeData[dayIndex] || {}).Confirmed || 0;
            deaths += (localeData[dayIndex] || {}).Deaths || 0;
        }
        $localeData[WORLD][dayIndex] = { Confirmed: confirmed, Deaths: deaths };
    }
}

function CalculateIncrease() {
    for (const country in $countries) {
        const localeData = $localeData[country];
        if (!localeData || !localeData[0]) continue;
        let last = localeData[0].Confirmed;
        for (const dayIndex in localeData) {
            const current = localeData[dayIndex].Confirmed;
            if (last > 0) {
                localeData[dayIndex].Increase = 100 * (current - last) / last;
            }
            last = current;
        }
    }
}

function PopulateSelectPicker() {
    $countrySelect.contents().remove();
    for (const [country, countryMetadata] of Object.entries($countries)) {
        if ((countryMetadata.Provinces || []).length > 0) {
            const optgroup = $("<optgroup>").attr("label", country);
            optgroup.append($("<option>").text(country));
            for (const province of countryMetadata.Provinces) {
                optgroup.append($("<option>").text(province));
            }
            $countrySelect.append(optgroup);
        } else {
            $countrySelect.append($("<option>").text(country));
        }
    }
    $countrySelect.selectpicker("refresh");
}

function CreatePeopleDataset(label, data, color) {
    return {
        label: label,
        data: data,
        borderWidth: 1,
        fill: false,
        lineTension: 0,
        borderColor: color,
        yAxisID: "left-y-axis",
    };
}

function CreatePercentageDataset(label, data, color) {
    return {
        label: label,
        data: data,
        borderWidth: 1,
        fill: false,
        lineTension: 0,
        borderColor: color,
        yAxisID: "right-y-axis",
    };
}

function ClearChartData() {
    $coronaChart.data.datasets = [];
}

function UpdateChartData() {
    const functionForCaseKind = {
        Confirmed: CreatePeopleDataset,
        Deaths: CreatePeopleDataset,
        Increase: CreatePercentageDataset,
    };
    const colorForCaseKind = {
        Confirmed: "hsl(%d, 70%, 70%, 0.7)",
        Deaths: "hsl(%d, 70%, 30%, 0.5)",
        Increase: "hsl(%d, 30%, 70%, 1.0)",
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
            const cases = ($localeData[country] || []).map(x => (x ? x[caseKind] : {}));
            const color = colorForCaseKind[caseKind].replace("%d", countryIndex * 360 / _selectedCountries.length);
            const dataset = functionForCaseKind[caseKind](`${country}${suffix}`, cases, color);
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

    if (_alignment == "date") {
        $coronaChart.data.labels = $dates.map(s => s.split("/").slice(0, 2).join("/"));
    } else if (_alignment == "last28") {
        $coronaChart.data.labels = $dates.slice(shift);
    } else {
        $coronaChart.data.labels = Array.from(Array(maxLength).entries()).map(x => x[0]); // 1 to maxLength
    }
    $coronaChart.options.scales.yAxes[0].ticks.max = _logScale ? Math.pow(10, Math.ceil(Math.log10(maxValue))) : undefined;
    $coronaChart.options.scales.yAxes[1].display = _selectedCaseKinds.includes("Increase");
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
                position: "right",
            },
            scales: {
                yAxes: [
                    {
                        id: "left-y-axis",
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
                    {
                        id: "right-y-axis",
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
                ]
            }
        }
    });
}

function CreateChartWhenDataReady() {
    if ($requestsPending > 0) {
        return;
    }

    PopulateDefaultsFromURL();
    CalculateWorldData();
    CalculateIncrease();
    PopulateSelectPicker();

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

function PopulateDefaultsFromURL() {
    const url = new URL(window.location);
    const searchParams = url.searchParams;
    _selectedCountries = (searchParams.get("locales") || "World").split("|").filter(x => $countries[x]);
    _selectedCaseKinds = (searchParams.get("casekinds") || "Confirmed").split("|");
    _logScale = searchParams.get("scale") == "log";
    _alignment = searchParams.get("alignment");
    UpdateButton($("#logarithmic"), _logScale);
    UpdateButton($("#linear"), !_logScale);
    UpdateButton($("#confirmed"), _selectedCaseKinds.includes("Confirmed"));
    UpdateButton($("#deaths"), _selectedCaseKinds.includes("Deaths"));
    UpdateButton($("#increase"), _selectedCaseKinds.includes("Increase"));
    UpdateButton($("#date"), _alignment == "date");
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
        $coronaChart.options.scales.yAxes[0].type = "logarithmic";
    } else {
        $coronaChart.options.scales.yAxes[0].type = "linear";
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
    if ($("#increase").prop("checked")) {
        _selectedCaseKinds.push("Increase");
    }
    UpdateChartData();
    UpdateURL();
}

function AlignmentUpdated() {
    const alignment = $("#date").prop("checked") ? "date" : $("#last28").prop("checked") ? "last28" : "since100";
    if (_alignment != alignment) {
        ClearChartData();
    }
    _alignment = alignment;
    UpdateChartData();
    UpdateURL();
}

function SelectTopCountries(count) {
    const countries = Object.keys($countries).filter(x => x != "World");
    const maxPerCountry = countries.map(x => [ x, ((($localeData[x] || []).slice(-1))[0] || {}).Confirmed || 0 ]);
    maxPerCountry.sort((a, b) => b[1] - a[1]);
    $countrySelect.selectpicker("val", maxPerCountry.slice(0, count).map(x => x[0]));
}

$(document).ready(function() {
    $countrySelect = $("#country-select");
    $countrySelect.selectpicker();
    $countrySelect.on("changed.bs.select", function(e, clickedIndex, isSelected, previousValue) {
        _selectedCountries = $countrySelect.val();
        UpdateURL();
        UpdateChartData();
    });

    $("#scale").change(ChartScaleUpdated);
    $("#caseKind").change(CaseKindUpdated);
    $("#alignment").change(AlignmentUpdated);
    $("#top10").click(() => SelectTopCountries(10));
    $("#top25").click(() => SelectTopCountries(25));

    ++$requestsPending;
    Papa.parse("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv", 
        {
            download: true,
            dynamicTyping: true,
            complete: function(results) {
                --$requestsPending;
                if (results.errors.length) throw new Error(results.errors);
                StoreDatesAndCountries(results.data);
                StoreLocaleData("Confirmed", results.data);
                CreateChartWhenDataReady();
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
                StoreLocaleData("Deaths", results.data);
                CreateChartWhenDataReady();
            }
        }
    );
});
