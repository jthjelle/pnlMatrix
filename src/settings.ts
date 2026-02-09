"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsGroup = formattingSettings.Group;
import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;



class RowHeaderSettings extends FormattingSettingsCard {
    public font = new formattingSettings.FontControl({
        name: "font",
        displayName: "Font",
        fontFamily: new formattingSettings.FontPicker({
            name: "fontFamily",
            displayName: "Font Family",
            value: "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif"
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "fontSize",
            displayName: "Font Size",
            value: 0
        }),
        bold: new formattingSettings.ToggleSwitch({
            name: "bold",
            displayName: "Bold",
            value: false
        }),
        italic: new formattingSettings.ToggleSwitch({
            name: "italic",
            displayName: "Italic",
            value: false
        }),
        underline: new formattingSettings.ToggleSwitch({
            name: "underline",
            displayName: "Underline",
            value: false
        })
    });

    public textColor = new formattingSettings.ColorPicker({
        name: "textColor",
        displayName: "Text Color",
        value: { value: "#000000" }
    });

    public backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Background Color",
        value: { value: "#ffffff" }
    });

    public bandedRowColor = new formattingSettings.ColorPicker({
        name: "bandedRowColor",
        displayName: "Banded Row Color",
        value: { value: "#f0f0f0" }
    });

    public showBandedRowColor = new formattingSettings.ToggleSwitch({
        name: "showBandedRowColor",
        displayName: "Show Banded Row Color",
        value: false
    });

    public alignment = new formattingSettings.AlignmentGroup({
        name: "alignment",
        displayName: "Alignment",
        mode: "Horizontal" as any,
        value: "left"
    });

    public textWrap = new formattingSettings.ToggleSwitch({
        name: "textWrap",
        displayName: "Text Wrap",
        value: true
    });

    public rowPadding = new formattingSettings.NumUpDown({
        name: "rowPadding",
        displayName: "Row Padding",
        value: 4
    });

    public textWidthMode = new formattingSettings.ItemDropdown({
        name: "textWidthMode",
        displayName: "Text Width Mode",
        items: [
            { value: "auto", displayName: "Auto" },
            { value: "fixed", displayName: "Fixed" }
        ],
        value: { value: "auto", displayName: "Auto" }
    });

    public textWidth = new formattingSettings.NumUpDown({
        name: "textWidth",
        displayName: "Text Width (px)",
        value: 200
    });

    public indentation = new formattingSettings.NumUpDown({
        name: "indentation",
        displayName: "Indentation (px)",
        value: 15
    });

    name: string = "rowHeaderSettings";
    displayName: string = "Row Headers";
    slices: Array<FormattingSettingsSlice> = [
        this.font, this.textColor, this.backgroundColor,
        this.showBandedRowColor, this.bandedRowColor,
        this.alignment, this.textWrap, this.rowPadding,
        this.textWidthMode, this.textWidth, this.indentation
    ];
}




class LayoutSettings extends FormattingSettingsCard {
    public globalFontSize = new formattingSettings.NumUpDown({
        name: "globalFontSize",
        displayName: "Global Font Size",
        value: 12
    });

    public columnOrder = new formattingSettings.TextInput({
        name: "columnOrder",
        displayName: "Column Order",
        value: "actualCY, actualPY, varCYPY, varCYPYPct, budget, varCYBud, varCYBudPct",
        placeholder: "e.g. actualCY, actualPY..."
    });

    public columnFormatting = new formattingSettings.TextInput({
        name: "columnFormatting",
        displayName: "Column Formatting (JSON)",
        value: "{}",
        placeholder: "{}"
    });

    public showGrandTotal = new formattingSettings.ToggleSwitch({
        name: "showGrandTotal",
        displayName: "Show Grand Total",
        value: false
    });

    public rowOrder = new formattingSettings.TextInput({
        name: "rowOrder",
        displayName: "Row Order (JSON)",
        value: "{}",
        placeholder: "{}"
    });

    public calculatedRows = new formattingSettings.TextInput({
        name: "calculatedRows",
        displayName: "Calculated Rows (JSON)",
        value: "[]",
        placeholder: "[]"
    });

    public calculatedColumns = new formattingSettings.TextInput({
        name: "calculatedColumns",
        displayName: "Calculated Columns (JSON)",
        value: "[]",
        placeholder: "[]"
    });

    public invertedRows = new formattingSettings.TextInput({
        name: "invertedRows",
        displayName: "Inverted Rows (JSON)",
        value: "[]",
        placeholder: "[]"
    });

    public invertAllValues = new formattingSettings.ToggleSwitch({
        name: "invertAllValues",
        displayName: "Invert All Values",
        value: false
    });

    public invertVarianceColors = new formattingSettings.ToggleSwitch({
        name: "invertVarianceColors",
        displayName: "Invert Variance Colors",
        value: false
    });

    public iconStyle = new formattingSettings.ItemDropdown({
        name: "iconStyle",
        displayName: "Expand/Collapse Icon",
        items: [
            { value: "arrow", displayName: "Arrow" },
            { value: "plusMinus", displayName: "Plus/Minus" },
            { value: "chevron", displayName: "Chevron" }
        ],
        value: { value: "chevron", displayName: "Chevron" }
    });

    public disableExpandCollapse = new formattingSettings.ToggleSwitch({
        name: "disableExpandCollapse",
        displayName: "Disable Expand/Collapse",
        value: false
    });

    public enableSorting = new formattingSettings.ToggleSwitch({
        name: "enableSorting",
        displayName: "Enable Sorting",
        value: true
    });

    public grandTotalPosition = new formattingSettings.ItemDropdown({
        name: "grandTotalPosition",
        displayName: "Grand Total Position",
        items: [
            { value: "bottom", displayName: "Bottom" },
            { value: "top", displayName: "Top" }
        ],
        value: { value: "bottom", displayName: "Bottom" }
    });

    public grandTotalLabel = new formattingSettings.TextInput({
        name: "grandTotalLabel",
        displayName: "Grand Total Label",
        value: "Grand Total",
        placeholder: "Grand Total"
    });

    public positiveColor = new formattingSettings.ColorPicker({
        name: "positiveColor",
        displayName: "Positive Color",
        value: { value: "#107C10" }  // Green
    });

    public negativeColor = new formattingSettings.ColorPicker({
        name: "negativeColor",
        displayName: "Negative Color",
        value: { value: "#D13438" }  // Red
    });

    public rowPadding = new formattingSettings.NumUpDown({
        name: "rowPadding",
        displayName: "Row Padding",
        value: 2
    });

    public name = "layoutSettings";
    displayName: string = "Layout";
    public slices: FormattingSettingsSlice[] = [
        this.globalFontSize,
        this.invertAllValues, this.invertVarianceColors, this.positiveColor, this.negativeColor,
        this.showGrandTotal, this.grandTotalPosition, this.grandTotalLabel, this.iconStyle, this.disableExpandCollapse, this.enableSorting,
        this.rowPadding
    ];
}

class TopNSettings extends FormattingSettingsCard {
    enabled = new formattingSettings.ToggleSwitch({
        name: "enabled",
        displayName: "Enable Top N",
        value: false
    });

    topN = new formattingSettings.NumUpDown({
        name: "topN",
        displayName: "Top N Count",
        value: 5
    });

    sortBy = new formattingSettings.ItemDropdown({
        name: "sortBy",
        displayName: "Sort By",
        items: [
            { value: "actualCY", displayName: "Actual CY" },
            { value: "budget", displayName: "Budget" },
            { value: "varCYPY", displayName: "Var CY-PY (Abs)" },
            { value: "varCYBud", displayName: "Var CY-Bud (Abs)" }
        ],
        value: { value: "actualCY", displayName: "Actual CY" }
    });

    otherLabel = new formattingSettings.TextInput({
        name: "otherLabel",
        displayName: "Other Row Label",
        placeholder: "Others",
        value: "Others"
    });

    name: string = "topNSettings";
    displayName: string = "Top N Filtering";
    slices: Array<FormattingSettingsSlice> = [this.enabled, this.topN, this.sortBy, this.otherLabel];
}

class ColumnVisibilitySettings extends FormattingSettingsGroup {
    showActualCY = new formattingSettings.ToggleSwitch({
        name: "showActualCY",
        displayName: "Actual CY",
        value: true
    });
    showActualPY = new formattingSettings.ToggleSwitch({
        name: "showActualPY",
        displayName: "Actual PY",
        value: true
    });
    showBudget = new formattingSettings.ToggleSwitch({
        name: "showBudget",
        displayName: "Budget",
        value: true
    });
    showForecast = new formattingSettings.ToggleSwitch({
        name: "showForecast",
        displayName: "Forecast",
        value: true
    });
    showVarCYPY = new formattingSettings.ToggleSwitch({
        name: "showVarCYPY",
        displayName: "Var CY-PY",
        value: true
    });
    showVarCYPYPct = new formattingSettings.ToggleSwitch({
        name: "showVarCYPYPct",
        displayName: "Var CY-PY %",
        value: true
    });
    showVarCYBud = new formattingSettings.ToggleSwitch({
        name: "showVarCYBud",
        displayName: "Var CY-Bud",
        value: true
    });
    showVarCYBudPct = new formattingSettings.ToggleSwitch({
        name: "showVarCYBudPct",
        displayName: "Var CY-Bud %",
        value: true
    });
    showVarCYFcst = new formattingSettings.ToggleSwitch({
        name: "showVarCYFcst",
        displayName: "Var CY-Fcst",
        value: true
    });
    showVarCYFcstPct = new formattingSettings.ToggleSwitch({
        name: "showVarCYFcstPct",
        displayName: "Var CY-Fcst %",
        value: true
    });

    name: string = "columnVisibility";
    displayName: string = "Column Visibility";
    slices: Array<FormattingSettingsSlice> = [
        this.showActualCY, this.showActualPY, this.showBudget, this.showForecast,
        this.showVarCYPY, this.showVarCYPYPct,
        this.showVarCYBud, this.showVarCYBudPct,
        this.showVarCYFcst, this.showVarCYFcstPct
    ];

    constructor() {
        super({
            name: "columnVisibility",
            displayName: "Column Visibility",
            slices: []
        });
    }
}

class NumberFormattingSettings extends FormattingSettingsCard {
    public displayUnits = new formattingSettings.AutoDropdown({
        name: "displayUnits",
        displayName: "Display Units",
        value: 1 // Default to None (1) instead of Auto (0)
    });

    public valuePrefix = new formattingSettings.TextInput({
        name: "valuePrefix",
        displayName: "Value Prefix",
        value: "",
        placeholder: ""
    });

    public valueSuffix = new formattingSettings.TextInput({
        name: "valueSuffix",
        displayName: "Value Suffix",
        value: "",
        placeholder: ""
    });

    public suffixThousands = new formattingSettings.TextInput({
        name: "suffixThousands",
        displayName: "Thousands Suffix",
        value: "k",
        placeholder: "k"
    });

    public suffixMillions = new formattingSettings.TextInput({
        name: "suffixMillions",
        displayName: "Millions Suffix",
        value: "M",
        placeholder: "M"
    });

    public suffixBillions = new formattingSettings.TextInput({
        name: "suffixBillions",
        displayName: "Billions Suffix",
        value: "B",
        placeholder: "B"
    });

    public decimalPlaces = new formattingSettings.NumUpDown({
        name: "decimalPlaces",
        displayName: "Decimal Places",
        value: 0
    });

    public useThousandSeparator = new formattingSettings.ToggleSwitch({
        name: "useThousandSeparator",
        displayName: "Thousand Separator",
        value: true
    });

    public thousandSeparatorChar = new formattingSettings.TextInput({
        name: "thousandSeparatorChar",
        displayName: "Separator Character",
        value: ",",
        placeholder: ","
    });

    public percentDecimalPlaces = new formattingSettings.NumUpDown({
        name: "percentDecimalPlaces",
        displayName: "Percent Decimal Places",
        value: 1
    });

    public showPercentSign = new formattingSettings.ToggleSwitch({
        name: "showPercentSign",
        displayName: "Show % Sign",
        value: true
    });

    public negativeFormat = new formattingSettings.ItemDropdown({
        name: "negativeFormat",
        displayName: "Negative Format",
        items: [
            { displayName: "-100", value: "minus" },
            { displayName: "(100)", value: "parentheses" }
        ],
        value: { displayName: "-100", value: "minus" }
    });

    public percentagePointAbbr = new formattingSettings.TextInput({
        name: "percentagePointAbbr",
        displayName: "Percentage Point Abbreviation",
        value: "pp",
        placeholder: "e.g. pp"
    });

    public textWrap = new formattingSettings.ToggleSwitch({
        name: "textWrap",
        displayName: "Text Wrap",
        value: false
    });

    name: string = "numberFormatting";
    displayName: string = "Number Formatting";
    slices: Array<FormattingSettingsSlice> = [
        this.displayUnits, this.valuePrefix, this.valueSuffix, this.suffixThousands, this.suffixMillions, this.suffixBillions,
        this.decimalPlaces, this.useThousandSeparator, this.thousandSeparatorChar,
        this.percentDecimalPlaces, this.showPercentSign, this.negativeFormat, this.percentagePointAbbr, this.textWrap
    ];
}



class ColumnHeaderSettings extends FormattingSettingsGroup {
    public font = new formattingSettings.FontControl({
        name: "font",
        displayName: "Font",
        fontFamily: new formattingSettings.FontPicker({
            name: "fontFamily",
            displayName: "Font Family",
            value: "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif"
        }),
        fontSize: new formattingSettings.NumUpDown({
            name: "fontSize",
            displayName: "Font Size",
            value: 0
        }),
        bold: new formattingSettings.ToggleSwitch({
            name: "bold",
            displayName: "Bold",
            value: true
        }),
        italic: new formattingSettings.ToggleSwitch({
            name: "italic",
            displayName: "Italic",
            value: false
        }),
        underline: new formattingSettings.ToggleSwitch({
            name: "underline",
            displayName: "Underline",
            value: false
        })
    });

    public textColor = new formattingSettings.ColorPicker({
        name: "textColor",
        displayName: "Text Color",
        value: { value: "#000000" }
    });

    public backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Background Color",
        value: { value: "#f0f0f0" }
    });

    public alignment = new formattingSettings.AlignmentGroup({
        name: "alignment",
        displayName: "Alignment",
        mode: "Horizontal" as any,
        value: "center"
    });

    public textWrap = new formattingSettings.ToggleSwitch({
        name: "textWrap",
        displayName: "Text Wrap",
        value: true
    });

    public headerWidthMode = new formattingSettings.ItemDropdown({
        name: "headerWidthMode",
        displayName: "Column Width Mode",
        items: [
            { value: "auto", displayName: "Auto" },
            { value: "fixed", displayName: "Fixed" }
        ],
        value: { value: "auto", displayName: "Auto" }
    });

    public widthForPercentage = new formattingSettings.NumUpDown({
        name: "widthForPercentage",
        displayName: "Width for % Columns (px)",
        value: 100
    });

    public widthForOthers = new formattingSettings.NumUpDown({
        name: "widthForOthers",
        displayName: "Width for Other Columns (px)",
        value: 120
    });

    name: string = "columnHeaderSettings";
    displayName: string = "Column Headers";
    slices: Array<FormattingSettingsSlice> = [this.font, this.textColor, this.backgroundColor, this.alignment, this.textWrap, this.headerWidthMode, this.widthForPercentage, this.widthForOthers];

    constructor() {
        super({
            name: "columnHeaderSettings",
            displayName: "Column Headers",
            slices: []
        });
    }
}

class GridLinesGroup extends FormattingSettingsGroup {
    name: string = "gridLinesGroup";
    displayName: string = "Grid Layout";

    public showHorizontal = new formattingSettings.ToggleSwitch({
        name: "showHorizontal",
        displayName: "Horizontal Gridlines",
        value: true
    });

    public horizontalColor = new formattingSettings.ColorPicker({
        name: "horizontalColor",
        displayName: "Horizontal Color",
        value: { value: "#eeeeee" }
    });

    public horizontalWidth = new formattingSettings.NumUpDown({
        name: "horizontalWidth",
        displayName: "Horizontal Width",
        value: 1
    });

    public horizontalStyle = new formattingSettings.ItemDropdown({
        name: "horizontalStyle",
        displayName: "Horizontal Style",
        items: [
            { displayName: "Solid", value: "solid" },
            { displayName: "Dashed", value: "dashed" },
            { displayName: "Dotted", value: "dotted" }
        ],
        value: { displayName: "Solid", value: "solid" }
    });

    public showVertical = new formattingSettings.ToggleSwitch({
        name: "showVertical",
        displayName: "Vertical Gridlines",
        value: false
    });

    public verticalColor = new formattingSettings.ColorPicker({
        name: "verticalColor",
        displayName: "Vertical Color",
        value: { value: "#eeeeee" }
    });

    public verticalWidth = new formattingSettings.NumUpDown({
        name: "verticalWidth",
        displayName: "Vertical Width",
        value: 1
    });

    public verticalStyle = new formattingSettings.ItemDropdown({
        name: "verticalStyle",
        displayName: "Vertical Style",
        items: [
            { displayName: "Solid", value: "solid" },
            { displayName: "Dashed", value: "dashed" },
            { displayName: "Dotted", value: "dotted" }
        ],
        value: { displayName: "Solid", value: "solid" }
    });

    slices: Array<FormattingSettingsSlice> = [
        this.showHorizontal, this.horizontalColor, this.horizontalWidth, this.horizontalStyle,
        this.showVertical, this.verticalColor, this.verticalWidth, this.verticalStyle
    ];

    constructor() {
        super({
            name: "gridLinesGroup",
            displayName: "Grid Layout",
            slices: []
        });
    }
}

class BordersGroup extends FormattingSettingsGroup {
    name: string = "bordersGroup";
    displayName: string = "Borders";

    public borderSection = new formattingSettings.ItemDropdown({
        name: "borderSection",
        displayName: "Section",
        items: [
            { displayName: "Row headers", value: "row" },
            { displayName: "Column headers", value: "col" },
            { displayName: "Values section", value: "val" },
            { displayName: "Group Outline", value: "group" }
        ],
        value: { displayName: "Row headers", value: "row" }
    });

    // Row Borders
    public rbTop = new formattingSettings.ToggleSwitch({ name: "rbTop", displayName: "Top", value: false });
    public rbBottom = new formattingSettings.ToggleSwitch({ name: "rbBottom", displayName: "Bottom", value: false });
    public rbLeft = new formattingSettings.ToggleSwitch({ name: "rbLeft", displayName: "Left", value: false });
    public rbRight = new formattingSettings.ToggleSwitch({ name: "rbRight", displayName: "Right", value: false });
    public rbColor = new formattingSettings.ColorPicker({ name: "rbColor", displayName: "Color", value: { value: "#000000" } });
    public rbWidth = new formattingSettings.NumUpDown({ name: "rbWidth", displayName: "Width", value: 1 });
    public rbStyle = new formattingSettings.ItemDropdown({
        name: "rbStyle",
        displayName: "Style",
        items: [
            { displayName: "Solid", value: "solid" },
            { displayName: "Dashed", value: "dashed" },
            { displayName: "Dotted", value: "dotted" }
        ],
        value: { displayName: "Solid", value: "solid" }
    });

    // Column Borders
    public cbTop = new formattingSettings.ToggleSwitch({ name: "cbTop", displayName: "Top", value: false });
    public cbBottom = new formattingSettings.ToggleSwitch({ name: "cbBottom", displayName: "Bottom", value: false });
    public cbLeft = new formattingSettings.ToggleSwitch({ name: "cbLeft", displayName: "Left", value: false });
    public cbRight = new formattingSettings.ToggleSwitch({ name: "cbRight", displayName: "Right", value: false });
    public cbColor = new formattingSettings.ColorPicker({ name: "cbColor", displayName: "Color", value: { value: "#000000" } });
    public cbWidth = new formattingSettings.NumUpDown({ name: "cbWidth", displayName: "Width", value: 1 });
    public cbStyle = new formattingSettings.ItemDropdown({
        name: "cbStyle",
        displayName: "Style",
        items: [
            { displayName: "Solid", value: "solid" },
            { displayName: "Dashed", value: "dashed" },
            { displayName: "Dotted", value: "dotted" }
        ],
        value: { displayName: "Solid", value: "solid" }
    });

    // Value Borders
    public vbTop = new formattingSettings.ToggleSwitch({ name: "vbTop", displayName: "Top", value: false });
    public vbBottom = new formattingSettings.ToggleSwitch({ name: "vbBottom", displayName: "Bottom", value: false });
    public vbLeft = new formattingSettings.ToggleSwitch({ name: "vbLeft", displayName: "Left", value: false });
    public vbRight = new formattingSettings.ToggleSwitch({ name: "vbRight", displayName: "Right", value: false });
    public vbColor = new formattingSettings.ColorPicker({ name: "vbColor", displayName: "Color", value: { value: "#000000" } });
    public vbWidth = new formattingSettings.NumUpDown({ name: "vbWidth", displayName: "Width", value: 1 });
    public vbStyle = new formattingSettings.ItemDropdown({
        name: "vbStyle",
        displayName: "Style",
        items: [
            { displayName: "Solid", value: "solid" },
            { displayName: "Dashed", value: "dashed" },
            { displayName: "Dotted", value: "dotted" }
        ],
        value: { displayName: "Solid", value: "solid" }
    });

    // Group Borders
    public gbTop = new formattingSettings.ToggleSwitch({ name: "gbTop", displayName: "Top", value: false });
    public gbBottom = new formattingSettings.ToggleSwitch({ name: "gbBottom", displayName: "Bottom", value: false });
    public gbLeft = new formattingSettings.ToggleSwitch({ name: "gbLeft", displayName: "Left", value: false });
    public gbRight = new formattingSettings.ToggleSwitch({ name: "gbRight", displayName: "Right", value: false });
    public gbColor = new formattingSettings.ColorPicker({ name: "gbColor", displayName: "Color", value: { value: "#000000" } });
    public gbWidth = new formattingSettings.NumUpDown({ name: "gbWidth", displayName: "Width", value: 1 });
    public gbStyle = new formattingSettings.ItemDropdown({
        name: "gbStyle",
        displayName: "Style",
        items: [
            { displayName: "Solid", value: "solid" },
            { displayName: "Dashed", value: "dashed" },
            { displayName: "Dotted", value: "dotted" }
        ],
        value: { displayName: "Solid", value: "solid" }
    });

    slices: Array<FormattingSettingsSlice> = [
        this.borderSection,
        this.rbTop, this.rbBottom, this.rbLeft, this.rbRight, this.rbColor, this.rbWidth, this.rbStyle,
        this.cbTop, this.cbBottom, this.cbLeft, this.cbRight, this.cbColor, this.cbWidth, this.cbStyle,
        this.vbTop, this.vbBottom, this.vbLeft, this.vbRight, this.vbColor, this.vbWidth, this.vbStyle,
        this.gbTop, this.gbBottom, this.gbLeft, this.gbRight, this.gbColor, this.gbWidth, this.gbStyle
    ];

    constructor() {
        super({
            name: "bordersGroup",
            displayName: "Borders",
            slices: []
        });
    }
}

class GridlineSettings extends FormattingSettingsCompositeCard {
    name: string = "gridlineSettings";
    displayName: string = "Gridlines";

    public gridLinesGroup = new GridLinesGroup();
    public bordersGroup = new BordersGroup();

    groups: Array<FormattingSettingsGroup> = [this.gridLinesGroup, this.bordersGroup];
}

class ColumnLabelsSettings extends FormattingSettingsGroup {
    headerRow = new formattingSettings.TextInput({
        name: "headerRow",
        displayName: "Row Header",
        value: "",
        placeholder: ""
    });
    headerGroupLabel = new formattingSettings.TextInput({
        name: "headerGroupLabel",
        displayName: "Group Label",
        value: "",
        placeholder: "Group"
    });
    headerActualCY = new formattingSettings.TextInput({
        name: "headerActualCY",
        displayName: "Actual CY Header",
        value: "CY",
        placeholder: "CY"
    });
    headerActualPY = new formattingSettings.TextInput({
        name: "headerActualPY",
        displayName: "Actual PY Header",
        value: "PY",
        placeholder: "PY"
    });
    headerBudget = new formattingSettings.TextInput({
        name: "headerBudget",
        displayName: "Budget Header",
        value: "BUD",
        placeholder: "BUD"
    });
    headerForecast = new formattingSettings.TextInput({
        name: "headerForecast",
        displayName: "Forecast Header",
        value: "FCST",
        placeholder: "FCST"
    });
    headerVarCYPY = new formattingSettings.TextInput({
        name: "headerVarCYPY",
        displayName: "Var CY-PY Header",
        value: "CY-PY",
        placeholder: "CY-PY"
    });
    headerVarCYPYPct = new formattingSettings.TextInput({
        name: "headerVarCYPYPct",
        displayName: "Var CY-PY % Header",
        value: "CY-PY%",
        placeholder: "CY-PY%"
    });
    headerVarCYBud = new formattingSettings.TextInput({
        name: "headerVarCYBud",
        displayName: "Var CY-Bud Header",
        value: "CY-BUD",
        placeholder: "CY-BUD"
    });
    headerVarCYBudPct = new formattingSettings.TextInput({
        name: "headerVarCYBudPct",
        displayName: "Var CY-Bud % Header",
        value: "CY-BUD%",
        placeholder: "CY-BUD%"
    });
    headerVarCYFcst = new formattingSettings.TextInput({
        name: "headerVarCYFcst",
        displayName: "Var CY-Fcst Header",
        value: "CY-FCST",
        placeholder: "CY-FCST"
    });
    headerVarCYFcstPct = new formattingSettings.TextInput({
        name: "headerVarCYFcstPct",
        displayName: "Var CY-Fcst % Header",
        value: "CY-FCST%",
        placeholder: "CY-FCST%"
    });

    name: string = "columnLabels";
    displayName: string = "Column Labels";
    slices: Array<FormattingSettingsSlice> = [
        this.headerRow, this.headerGroupLabel,
        this.headerActualCY, this.headerActualPY, this.headerBudget, this.headerForecast,
        this.headerVarCYPY, this.headerVarCYPYPct,
        this.headerVarCYBud, this.headerVarCYBudPct,
        this.headerVarCYFcst, this.headerVarCYFcstPct
    ];

    constructor() {
        super({
            name: "columnLabels",
            displayName: "Column Labels",
            slices: []
        });
    }
}

class ColumnsSettings extends FormattingSettingsCompositeCard {
    name: string = "columnsSettings";
    displayName: string = "Columns";

    public columnHeaderSettings = new ColumnHeaderSettings();
    public columnVisibility = new ColumnVisibilitySettings();
    public columnLabels = new ColumnLabelsSettings();

    groups: Array<FormattingSettingsGroup> = [this.columnHeaderSettings, this.columnVisibility, this.columnLabels];
}

class GroupTitleSettings extends FormattingSettingsCard {
    name: string = "groupTitleSettings";
    displayName: string = "Group Title";

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#000000" }
    });

    alignment = new formattingSettings.AlignmentGroup({
        name: "alignment",
        displayName: "Alignment",
        mode: "Horizontal" as any,
        value: "center"
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Text Size",
        value: 0
    });

    fontFamily = new formattingSettings.FontPicker({
        name: "fontFamily",
        displayName: "Font Family",
        value: "Segoe UI, wf_segoe-ui_normal, helvetica, arial, sans-serif"
    });

    textWidthMode = new formattingSettings.ItemDropdown({
        name: "textWidthMode",
        displayName: "Text Width",
        items: [
            { displayName: "Auto", value: "auto" },
            { displayName: "Fixed", value: "fixed" }
        ],
        value: { displayName: "Auto", value: "auto" }
    });

    textWidth = new formattingSettings.NumUpDown({
        name: "textWidth",
        displayName: "Fixed Width",
        value: 100
    });

    textWrap = new formattingSettings.ToggleSwitch({
        name: "textWrap",
        displayName: "Text Wrap",
        value: false
    });

    slices: Array<FormattingSettingsSlice> = [
        this.fontColor,
        this.alignment,
        this.fontSize,
        this.fontFamily,
        this.textWidthMode,
        this.textWidth,
        this.textWrap
    ];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    rowHeaderSettings = new RowHeaderSettings();

    layoutSettings = new LayoutSettings();
    topNSettings = new TopNSettings();
    columnsSettings = new ColumnsSettings();
    groupTitleSettings = new GroupTitleSettings();
    numberFormatting = new NumberFormattingSettings();
    gridlineSettings = new GridlineSettings();

    cards = [
        this.layoutSettings,
        this.rowHeaderSettings,
        this.columnsSettings,
        this.groupTitleSettings,
        this.numberFormatting,
        this.gridlineSettings,
        this.topNSettings
    ];
}
