import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;
import FormattingSettingsGroup = formattingSettings.Group;
import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
declare class RowHeaderSettings extends FormattingSettingsCard {
    font: formattingSettings.FontControl;
    textColor: formattingSettings.ColorPicker;
    backgroundColor: formattingSettings.ColorPicker;
    bandedRowColor: formattingSettings.ColorPicker;
    showBandedRowColor: formattingSettings.ToggleSwitch;
    alignment: formattingSettings.AlignmentGroup;
    textWrap: formattingSettings.ToggleSwitch;
    rowPadding: formattingSettings.NumUpDown;
    textWidthMode: formattingSettings.ItemDropdown;
    textWidth: formattingSettings.NumUpDown;
    indentation: formattingSettings.NumUpDown;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class LayoutSettings extends FormattingSettingsCard {
    globalFontSize: formattingSettings.NumUpDown;
    columnOrder: formattingSettings.TextInput;
    columnFormatting: formattingSettings.TextInput;
    showGrandTotal: formattingSettings.ToggleSwitch;
    rowOrder: formattingSettings.TextInput;
    calculatedRows: formattingSettings.TextInput;
    calculatedColumns: formattingSettings.TextInput;
    invertedRows: formattingSettings.TextInput;
    invertAllValues: formattingSettings.ToggleSwitch;
    invertVarianceColors: formattingSettings.ToggleSwitch;
    iconStyle: formattingSettings.ItemDropdown;
    disableExpandCollapse: formattingSettings.ToggleSwitch;
    enableSorting: formattingSettings.ToggleSwitch;
    grandTotalPosition: formattingSettings.ItemDropdown;
    grandTotalLabel: formattingSettings.TextInput;
    positiveColor: formattingSettings.ColorPicker;
    negativeColor: formattingSettings.ColorPicker;
    rowPadding: formattingSettings.NumUpDown;
    name: string;
    displayName: string;
    slices: FormattingSettingsSlice[];
}
declare class TopNSettings extends FormattingSettingsCard {
    enabled: formattingSettings.ToggleSwitch;
    topN: formattingSettings.NumUpDown;
    sortBy: formattingSettings.ItemDropdown;
    otherLabel: formattingSettings.TextInput;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class ColumnVisibilitySettings extends FormattingSettingsGroup {
    showActualCY: formattingSettings.ToggleSwitch;
    showActualPY: formattingSettings.ToggleSwitch;
    showBudget: formattingSettings.ToggleSwitch;
    showForecast: formattingSettings.ToggleSwitch;
    showVarCYPY: formattingSettings.ToggleSwitch;
    showVarCYPYPct: formattingSettings.ToggleSwitch;
    showVarCYBud: formattingSettings.ToggleSwitch;
    showVarCYBudPct: formattingSettings.ToggleSwitch;
    showVarCYFcst: formattingSettings.ToggleSwitch;
    showVarCYFcstPct: formattingSettings.ToggleSwitch;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
    constructor();
}
declare class NumberFormattingSettings extends FormattingSettingsCard {
    displayUnits: formattingSettings.AutoDropdown;
    valuePrefix: formattingSettings.TextInput;
    valueSuffix: formattingSettings.TextInput;
    suffixThousands: formattingSettings.TextInput;
    suffixMillions: formattingSettings.TextInput;
    suffixBillions: formattingSettings.TextInput;
    decimalPlaces: formattingSettings.NumUpDown;
    useThousandSeparator: formattingSettings.ToggleSwitch;
    thousandSeparatorChar: formattingSettings.TextInput;
    percentDecimalPlaces: formattingSettings.NumUpDown;
    showPercentSign: formattingSettings.ToggleSwitch;
    negativeFormat: formattingSettings.ItemDropdown;
    percentagePointAbbr: formattingSettings.TextInput;
    textWrap: formattingSettings.ToggleSwitch;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
}
declare class ColumnHeaderSettings extends FormattingSettingsGroup {
    font: formattingSettings.FontControl;
    textColor: formattingSettings.ColorPicker;
    backgroundColor: formattingSettings.ColorPicker;
    alignment: formattingSettings.AlignmentGroup;
    textWrap: formattingSettings.ToggleSwitch;
    headerWidthMode: formattingSettings.ItemDropdown;
    widthForPercentage: formattingSettings.NumUpDown;
    widthForOthers: formattingSettings.NumUpDown;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
    constructor();
}
declare class GridLinesGroup extends FormattingSettingsGroup {
    name: string;
    displayName: string;
    showHorizontal: formattingSettings.ToggleSwitch;
    horizontalColor: formattingSettings.ColorPicker;
    horizontalWidth: formattingSettings.NumUpDown;
    horizontalStyle: formattingSettings.ItemDropdown;
    showVertical: formattingSettings.ToggleSwitch;
    verticalColor: formattingSettings.ColorPicker;
    verticalWidth: formattingSettings.NumUpDown;
    verticalStyle: formattingSettings.ItemDropdown;
    slices: Array<FormattingSettingsSlice>;
    constructor();
}
declare class BordersGroup extends FormattingSettingsGroup {
    name: string;
    displayName: string;
    borderSection: formattingSettings.ItemDropdown;
    rbTop: formattingSettings.ToggleSwitch;
    rbBottom: formattingSettings.ToggleSwitch;
    rbLeft: formattingSettings.ToggleSwitch;
    rbRight: formattingSettings.ToggleSwitch;
    rbColor: formattingSettings.ColorPicker;
    rbWidth: formattingSettings.NumUpDown;
    rbStyle: formattingSettings.ItemDropdown;
    cbTop: formattingSettings.ToggleSwitch;
    cbBottom: formattingSettings.ToggleSwitch;
    cbLeft: formattingSettings.ToggleSwitch;
    cbRight: formattingSettings.ToggleSwitch;
    cbColor: formattingSettings.ColorPicker;
    cbWidth: formattingSettings.NumUpDown;
    cbStyle: formattingSettings.ItemDropdown;
    vbTop: formattingSettings.ToggleSwitch;
    vbBottom: formattingSettings.ToggleSwitch;
    vbLeft: formattingSettings.ToggleSwitch;
    vbRight: formattingSettings.ToggleSwitch;
    vbColor: formattingSettings.ColorPicker;
    vbWidth: formattingSettings.NumUpDown;
    vbStyle: formattingSettings.ItemDropdown;
    gbTop: formattingSettings.ToggleSwitch;
    gbBottom: formattingSettings.ToggleSwitch;
    gbLeft: formattingSettings.ToggleSwitch;
    gbRight: formattingSettings.ToggleSwitch;
    gbColor: formattingSettings.ColorPicker;
    gbWidth: formattingSettings.NumUpDown;
    gbStyle: formattingSettings.ItemDropdown;
    slices: Array<FormattingSettingsSlice>;
    constructor();
}
declare class GridlineSettings extends FormattingSettingsCompositeCard {
    name: string;
    displayName: string;
    gridLinesGroup: GridLinesGroup;
    bordersGroup: BordersGroup;
    groups: Array<FormattingSettingsGroup>;
}
declare class ColumnLabelsSettings extends FormattingSettingsGroup {
    headerRow: formattingSettings.TextInput;
    headerGroupLabel: formattingSettings.TextInput;
    headerActualCY: formattingSettings.TextInput;
    headerActualPY: formattingSettings.TextInput;
    headerBudget: formattingSettings.TextInput;
    headerForecast: formattingSettings.TextInput;
    headerVarCYPY: formattingSettings.TextInput;
    headerVarCYPYPct: formattingSettings.TextInput;
    headerVarCYBud: formattingSettings.TextInput;
    headerVarCYBudPct: formattingSettings.TextInput;
    headerVarCYFcst: formattingSettings.TextInput;
    headerVarCYFcstPct: formattingSettings.TextInput;
    name: string;
    displayName: string;
    slices: Array<FormattingSettingsSlice>;
    constructor();
}
declare class ColumnsSettings extends FormattingSettingsCompositeCard {
    name: string;
    displayName: string;
    columnHeaderSettings: ColumnHeaderSettings;
    columnVisibility: ColumnVisibilitySettings;
    columnLabels: ColumnLabelsSettings;
    groups: Array<FormattingSettingsGroup>;
}
declare class GroupTitleSettings extends FormattingSettingsCard {
    name: string;
    displayName: string;
    fontColor: formattingSettings.ColorPicker;
    alignment: formattingSettings.AlignmentGroup;
    fontSize: formattingSettings.NumUpDown;
    fontFamily: formattingSettings.FontPicker;
    textWidthMode: formattingSettings.ItemDropdown;
    textWidth: formattingSettings.NumUpDown;
    textWrap: formattingSettings.ToggleSwitch;
    slices: Array<FormattingSettingsSlice>;
}
export declare class VisualFormattingSettingsModel extends FormattingSettingsModel {
    rowHeaderSettings: RowHeaderSettings;
    layoutSettings: LayoutSettings;
    topNSettings: TopNSettings;
    columnsSettings: ColumnsSettings;
    groupTitleSettings: GroupTitleSettings;
    numberFormatting: NumberFormattingSettings;
    gridlineSettings: GridlineSettings;
    cards: (LayoutSettings | RowHeaderSettings | ColumnsSettings | GroupTitleSettings | NumberFormattingSettings | GridlineSettings | TopNSettings)[];
}
export {};
