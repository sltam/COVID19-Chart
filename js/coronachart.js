// Data
const WORLD = "World";
const $localeData = {}; // $localeData[localeName][date][key]
const $countries = { [WORLD]: [] };
let _coronaChart = null;
let $dates;
let $requestsPending = 0;

// Properties
let _logScale;
let _alignment;
let _selectedCountries;
let _selectedCaseKinds;


function StoreDatesAndCountries(csvData) {
    const header = csvData.shift();
    $dates = header.slice(4); // All available dates
    const rows = csvData;
    const countries = rows.map(x => x[1]);
    for (const country of countries) {
        $countries[country] = {};
    }
}

function StoreLocaleData(key, csvData) {
    csvData = csvData.slice(1); // Drop header
    for (const row of csvData.slice(1)) {
        const [province, country, lat, long] = row;
        $localeData[country] = $localeData[country] || [];
        for (const [dayIndex, datum] of row.slice(4).entries()) {
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
            const countryData = $localeData[country] || {};
            confirmed += (countryData[dayIndex] || {}).Confirmed || 0;
            deaths += (countryData[dayIndex] || {}).Deaths || 0;
        }
        $localeData[WORLD][dayIndex] = { Confirmed: confirmed, Deaths: deaths };
    }
}

function CalculateIncrease() {
    for (const country in $countries) {
        const countryData = $localeData[country];
        if (!countryData) continue;
        let last = countryData[0].Confirmed;
        for (const dayIndex in countryData) {
            const current = countryData[dayIndex].Confirmed;
            if (last > 0) {
                countryData[dayIndex].Increase = 100 * (current - last) / last;
            }
            last = current;
        }
    }
}

function AddCountriesToSelectPicker($countries) {
    let select = $("#country-select");
    select.contents().remove();
    for (const country in $countries) {
        select.append("<option>" + country + "</option>");
    }
    select.selectpicker('refresh');
}

function CreatePeopleDataset(label, data, color) {
    return {
        label: label,
        data: data,
        borderWidth: 1,
        fill: false,
        lineTension: 0,
        borderColor: color,
        yAxisID: 'left-y-axis'
    }
}

function CreatePercentageDataset(label, data, color) {
    return {
        label: label,
        data: data,
        borderWidth: 1,
        fill: false,
        lineTension: 0,
        borderColor: color,
        yAxisID: 'right-y-axis'
    }
}

function ClearChartData() {
    _coronaChart.data.datasets = [];
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

    const datasets = _coronaChart.data.datasets;
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
        _coronaChart.data.labels = $dates.map(s => s.split("/").slice(0, 2).join("/"));
    } else if (_alignment == "last28") {
        _coronaChart.data.labels = $dates.slice(shift);
    } else {
        _coronaChart.data.labels = Array.from(Array(maxLength).entries()).map(x => x[0]); // 1 to maxLength
    }
    _coronaChart.options.scales.yAxes[0].ticks.max = _logScale ? Math.pow(10, Math.ceil(Math.log10(maxValue))) : undefined;
    _coronaChart.options.scales.yAxes[1].display = _selectedCaseKinds.includes("Increase");
    _coronaChart.update();
}

function CreateChart() {
    let ctx = document.getElementById("coronaChart");

    _coronaChart = new Chart(ctx, {
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
    AddCountriesToSelectPicker($countries);

    CreateChart();
    ChartScaleUpdated();
    CaseKindUpdated();
    AlignmentUpdated();

    $('#country-select').selectpicker('val', _selectedCountries);
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
        _coronaChart.options.scales.yAxes[0].type = "logarithmic";
    } else {
        _coronaChart.options.scales.yAxes[0].type = "linear";
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
    _selectedCountries = maxPerCountry.slice(0, count).map(x => x[0]);
    $('#country-select').selectpicker('val', _selectedCountries);
    UpdateChartData();
}

$(document).ready(function() {
    $('#country-select').selectpicker();
    $('#country-select').on('changed.bs.select', function(e, clickedIndex, isSelected, previousValue) {
        if (clickedIndex === null) return;
        let multiselect = $('#country-select')[0].hasAttribute('multiple');
        let index = multiselect ? clickedIndex : clickedIndex - 1;
        let country = Object.keys($countries)[index];

        if (multiselect) {
            const existingIndex = _selectedCountries.indexOf(country);
            if (existingIndex < 0) {
                _selectedCountries.push(country);
            } else {
                _selectedCountries.splice(existingIndex, 1);
            }
        } else {
            _selectedCountries = [country];
        }
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
