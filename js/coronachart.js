var _coronaChart = null;
var _confirmedPerCountry = {};
var _deathsPerCountry = {};
var _increasePerCountry = {};
const casesPerCountryForCaseKind = {
    Confirmed: _confirmedPerCountry,
    Deaths: _deathsPerCountry,
    Increase: _increasePerCountry,
};
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
var _logScale = false;
var _alignment = "date";
var _countries = [];
var _selectedCountries = [];
var _selectedCaseKinds = [];
var _dates = [];
var _dataReceived = 0;

function StoreDataInObject(object, csvData) {
    for (let index = 0; index < csvData.length; index++) {
        const element = csvData[index];
        const name = element[1];

        if (name in object) {
            for (let i = 0; i < object[name].length; i++) {
                object[name][i] += element[4 + i];
            }
        } else {
            object[name] = element.slice(4);
        }
    }

}

function StoreCountries(csvData) {
    _countries = [];
    let checkDups = {};

    for (let index = 1; index < csvData.length; index++) {
        const country = csvData[index][1];

        if (!(country in checkDups)) {
            _countries.push(country);
            checkDups[country] = true;
        }
    }
    _countries.sort();
}

function CalculateWorldData() {
    _confirmedPerCountry['World'] = [];
    _deathsPerCountry['World'] = [];
    
    for (let index = 0; index < _countries.length; index++) {
        const country = _countries[index];
        for (let dayIndex = 0; dayIndex < _confirmedPerCountry[country].length; dayIndex++) {
            if (dayIndex in _confirmedPerCountry['World']) {
                _confirmedPerCountry['World'][dayIndex] += _confirmedPerCountry[country][dayIndex];
                _deathsPerCountry['World'][dayIndex] += _deathsPerCountry[country][dayIndex]; 
            } else {
                _confirmedPerCountry['World'][dayIndex] = _confirmedPerCountry[country][dayIndex];
                _deathsPerCountry['World'][dayIndex] = _deathsPerCountry[country][dayIndex]; 
            }
        }
    }

    _countries.unshift('World');
}

function StoreConfirmedPerCountry(csvData) {
    StoreDataInObject(_confirmedPerCountry, csvData);
}

function StoreDeathsPerCountry(csvData) {
    StoreDataInObject(_deathsPerCountry, csvData);
}

function CalculateIncrease() {
    for (let index = 0; index < _countries.length; index++) {
        const country = _countries[index];
        const confirmed = _confirmedPerCountry[country];
        let last = confirmed[0];
        _increasePerCountry[country] = [];
        
        for (let confirmedIndex = 1; confirmedIndex < confirmed.length; confirmedIndex++) {
            const element = confirmed[confirmedIndex];

            if (last > 0) {
                _increasePerCountry[country][confirmedIndex] = 100 * (element - last) / last;
            }
            last = element;
        }
    }
}

function AddCountriesToSelectPicker(_countries) {
    let select = $("#country-select");
    select.contents().remove();

    for (let index = 0; index < _countries.length; index++) {
        const element = _countries[index];
        select.append("<option>" + element + "</option>");
    }

    select.selectpicker('refresh');
}

function GetChartDataForCountry(countryName) {
    return _confirmedPerCountry[countryName];
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
    const datasets = _coronaChart.data.datasets;
    const datasetByID = {};
    datasets.forEach(dataset => datasetByID[dataset.id] = dataset);
    datasets.splice(0, datasets.length);
    let maxLength = 0;
    let maxValue = 0;
    let shift = 0; // Number of initial entries to drop
    if (_alignment == "last28") {
        shift = _dates.length - 28;
    }
    for (const [countryIndex, countryName] of _selectedCountries.entries()) {
        if (_alignment == "since100") {
            shift = _confirmedPerCountry[countryName].filter(x => x < 100).length;
        }
        for (const caseKind of _selectedCaseKinds) {
            const id = `${countryName}-${caseKind}`;
            const suffix = _selectedCaseKinds.length == 1 ? "" : `-${caseKind}`;
            const cases = casesPerCountryForCaseKind[caseKind][countryName];
            const color = colorForCaseKind[caseKind].replace("%d", countryIndex * 360 / _selectedCountries.length);
            const dataset = functionForCaseKind[caseKind](`${countryName}${suffix}`, cases, color);
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
        _coronaChart.data.labels = _dates;
    } else if (_alignment == "last28") {
        _coronaChart.data.labels = _dates.slice(shift);
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
            labels: _dates,
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
    if (_dataReceived < 2) {
        return;
    }

    PopulateDefaultsFromURL();
    CalculateWorldData();
    CalculateIncrease();
    AddCountriesToSelectPicker(_countries);

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
    _selectedCountries = (searchParams.get("locales") || "World").split("|").filter(x => _countries.includes(x));
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

$(document).ready(function() {
    $('#country-select').selectpicker();
    $('#country-select').on('changed.bs.select', function(e, clickedIndex, isSelected, previousValue) {
        if (clickedIndex === null) return;
        let multiselect = $('#country-select')[0].hasAttribute('multiple');
        let index = multiselect ? clickedIndex : clickedIndex - 1;
        let country = _countries[index];

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

    Papa.parse("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv", 
        {
            download: true,
            dynamicTyping: true,
            complete: function(results) {
                const data = results.data;
                _dates = data[0].slice(4); // All available dates
                StoreCountries(data);
                StoreConfirmedPerCountry(data);
                _dataReceived++;
                CreateChartWhenDataReady();
            }
        }
    );

    Papa.parse("https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv", 
        {
            download: true,
            dynamicTyping: true,
            complete: function(results) {
                StoreDeathsPerCountry(results.data);
                _dataReceived++;
                CreateChartWhenDataReady();
            }
        }
    );
});
