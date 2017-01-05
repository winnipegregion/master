/**
 * A Highcharts plugin for exporting data from a rendered chart as CSV, XLS or HTML table
 *
 * Author:   Torstein Honsi
 * Licence:  MIT
 * Version:  1.4.3
 */
/*global Highcharts, window, document, Blob */
(function (factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory;
    } else {
        factory(Highcharts);
    }
})(function (Highcharts) {

    'use strict';

    var each = Highcharts.each,
        pick = Highcharts.pick,
        seriesTypes = Highcharts.seriesTypes,
        downloadAttrSupported = document.createElement('a').download !== undefined;

    Highcharts.setOptions({
        lang: {
            downloadCSV: 'Download CSV',
        }
    });


    /**
     * Get the data rows as a two dimensional array
     */
    Highcharts.Chart.prototype.getDataRows = function () {
        var options = (this.options.exporting || {}).csv || {},
            xAxis = this.xAxis[0],
            rows = {},
            rowArr = [],
            dataRows,
            names = [],
            i,
            x,
            xTitle,
            // Options
            dateFormat = options.dateFormat || '%Y-%m-%d %H:%M:%S',
            columnHeaderFormatter = options.columnHeaderFormatter || function (item, key, keyLength) {
                if (item instanceof Highcharts.Axis) {
                    return (item.options.title && item.options.title.text) ||
                        (item.isDatetimeAxis ? 'DateTime' : 'Category');
                }
                return item.name + (keyLength > 1 ? ' ('+ key + ')' : '');
            };

        // Loop the series and index values
        i = 0;
        each(this.series, function (series) {
            var keys = series.options.keys,
                pointArrayMap = keys || series.pointArrayMap || ['y'],
                valueCount = pointArrayMap.length,
                requireSorting = series.requireSorting,
                categoryMap = {},
                j;

            // Map the categories for value axes
            each(pointArrayMap, function (prop) {
                categoryMap[prop] = (series[prop + 'Axis'] && series[prop + 'Axis'].categories) || [];
            });

            if (series.options.includeInCSVExport !== false && series.visible !== false) { // #55
                j = 0;
                while (j < valueCount) {
                    names.push(columnHeaderFormatter(series, pointArrayMap[j], pointArrayMap.length));
                    j = j + 1;
                }

                each(series.points, function (point, pIdx) {
                    var key = requireSorting ? point.x : pIdx,
                        prop,
                        val;

                    j = 0;

                    if (!rows[key]) {
                        rows[key] = [];
                    }
                    rows[key].x = point.x;

                    // Pies, funnels, geo maps etc. use point name in X row
                    if (!series.xAxis || series.exportKey === 'name') {
                        rows[key].name = point.name;
                    }

                    while (j < valueCount) {
                        prop = pointArrayMap[j]; // y, z etc
                        val = point[prop];
                        rows[key][i + j] = pick(categoryMap[prop][val], val); // Pick a Y axis category if present
                        j = j + 1;
                    }

                });
                i = i + j;
            }
        });

        // Make a sortable array
        for (x in rows) {
            if (rows.hasOwnProperty(x)) {
                rowArr.push(rows[x]);
            }
        }
        // Sort it by X values
        rowArr.sort(function (a, b) {
            return a.x - b.x;
        });

        // Add header row
        xTitle = columnHeaderFormatter(xAxis);
        dataRows = [[xTitle].concat(names)];

        // Add the category column
        each(rowArr, function (row) {

            var category = row.name;
            if (!category) {
                if (xAxis.isDatetimeAxis) {
                    if (row.x instanceof Date) {
                        row.x = row.x.getTime();
                    }
                    category = Highcharts.dateFormat(dateFormat, row.x);
                } else if (xAxis.categories) {
                    category = pick(xAxis.names[row.x], xAxis.categories[row.x], row.x)
                } else {
                    category = row.x;
                }
            }

            // Add the X/date/category
            row.unshift(category);
            dataRows.push(row);
        });

        return dataRows;
    };

    /**
     * Get a CSV string
     */
    Highcharts.Chart.prototype.getCSV = function (useLocalDecimalPoint) {
        var csv = '',
            rows = this.getDataRows(),
            options = (this.options.exporting || {}).csv || {},
            itemDelimiter = options.itemDelimiter || ',', // use ';' for direct import to Excel
            lineDelimiter = options.lineDelimiter || '\n'; // '\n' isn't working with the js csv data extraction

        // Transform the rows to CSV
        each(rows, function (row, i) {
            var val = '',
                j = row.length,
                n = useLocalDecimalPoint ? (1.1).toLocaleString()[1] : '.';
            while (j--) {
                val = row[j];
                if (typeof val === "string") {
                    val = '"' + val + '"';
                }
                if (typeof val === 'number') {
                    if (n === ',') {
                        val = val.toString().replace(".", ",");
                    }
                }
                row[j] = val;
            }
            // Add the values
            csv += row.join(itemDelimiter);

            // Add the line delimiter
            if (i < rows.length - 1) {
                csv += lineDelimiter;
            }
        });
        return csv;
    };

    /**
     * Build a HTML table with the data
     */
 

    function getContent(chart, href, extension, content, MIME) {
        var a,
            blobObject,
            name,
            options = (chart.options.exporting || {}).csv || {},
            url = options.url || 'http://www.highcharts.com/studies/csv-export/download.php';

        if (chart.options.exporting.filename) {
            name = chart.options.exporting.filename;
        } else if (chart.title) {
            name = chart.title.textStr.replace(/ /g, '-').toLowerCase();
        } else {
            name = 'chart';
        }

        // MS specific. Check this first because of bug with Edge (#76)
        if (window.Blob && window.navigator.msSaveOrOpenBlob) {
            // Falls to msSaveOrOpenBlob if download attribute is not supported
            blobObject = new Blob([content]);
            window.navigator.msSaveOrOpenBlob(blobObject, name + '.' + extension);

        // Download attribute supported
        } else if (downloadAttrSupported) {
            a = document.createElement('a');
            a.href = href;
            a.target = '_blank';
            a.download = name + '.' + extension;
            document.body.appendChild(a);
            a.click();
            a.remove();

        } else {
            // Fall back to server side handling
            Highcharts.post(url, {
                data: content,
                type: MIME,
                extension: extension
            });
        }
    }

    /**
     * Call this on click of 'Download CSV' button
     */
    Highcharts.Chart.prototype.downloadCSV = function () {
        var csv = this.getCSV(true);
        getContent(
            this,
            'data:text/csv,\uFEFF' + csv.replace(/\n/g, '%0A'),
            'csv',
            csv,
            'text/csv'
        );
    };

    /**
     * Call this on click of 'Download XLS' button
     */


    /**
     * View the data in a table below the chart
     */


    // Add "Download CSV" to the exporting menu. Use download attribute if supported, else
    // run a simple PHP script that returns a file. The source code for the PHP script can be viewed at
    // https://raw.github.com/highslide-software/highcharts.com/master/studies/csv-export/csv.php
    if (Highcharts.getOptions().exporting) {
        Highcharts.getOptions().exporting.buttons.contextButton.menuItems.push({
            textKey: 'downloadCSV',
            onclick: function () { this.downloadCSV(); }
        }, {
            textKey: '',
            onclick: function () { this.downloadXLS(); }
        });
    }

    // Series specific
    if (seriesTypes.map) {
        seriesTypes.map.prototype.exportKey = 'name';
    }
    if (seriesTypes.mapbubble) {
        seriesTypes.mapbubble.prototype.exportKey = 'name';
    }

});
