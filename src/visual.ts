/*
*  P&L Matrix Visual - Vanilla JS Version with Sorting & Sign Inversion
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import ViewMode = powerbi.ViewMode;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import ITooltipService = powerbi.extensibility.ITooltipService;
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel } from "./settings";


interface PnLRow {
    label: string;
    id: string; // Unique path ID
    level: number;
    isSubtotal: boolean;
    actualCY?: number;
    actualPY?: number;
    budget?: number;
    forecast?: number;
    varCYPY?: number;
    varCYPYPct?: number;
    varCYBud?: number;
    varCYBudPct?: number;
    varCYFcst?: number;
    varCYFcstPct?: number;
    children: PnLRow[];
    // Formatting
    format?: CalculatedRowFormat;
    isBlank?: boolean;
    selectionId?: ISelectionId;
    skip?: boolean;
    result?: boolean;
    // Grouped values: [GroupName] -> [MeasureKey] -> value
    groupedValues?: Record<string, Record<string, number>>;
}

interface CalculatedRowFormat {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    overline?: boolean;
    invertSign?: boolean;
    backgroundColor?: string;
    percentage?: boolean;
}

type SortColumn = "label" | "actualCY" | "actualPY" | "varCYPY" | "varCYPYPct" | "budget" | "varCYBud" | "varCYBudPct";
type SortDirection = "asc" | "desc" | "none";

interface ColumnFormatConfig {
    type?: "text" | "databar" | "waterfall" | "background" | "font" | "lollipop" | "bullet";
    backgroundColor?: string;
    fontColor?: string;
    databarColor?: string;
    showSentiment?: boolean; // For databar/waterfall to use sentiment colors
}

interface CalculatedRowConfig {
    name: string;
    formula: string; // e.g. "Revenue - COGS"
    id: string;
    format?: CalculatedRowFormat;
    isBlank?: boolean;
    skip?: boolean;
    result?: boolean;
    // Grouped values: [GroupName] -> [MeasureKey] -> value
    groupedValues?: Record<string, Record<string, number>>;
}

interface ColumnGroup {
    name: string;
    displayName: string;
}

interface CalculatedColumnConfig {
    name: string;
    formula: string; // e.g. "[Actual CY] - [Budget]"
    id: string; // unique key
    format?: CalculatedRowFormat; // Reuse same format config for now
}

export class Visual implements IVisual {
    private target: HTMLElement;
    private container: HTMLDivElement;
    private currentRows: PnLRow[] = [];
    private sortColumn: SortColumn | null = null;
    private sortDirection: SortDirection = "none";
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private selectionManager: ISelectionManager;
    private tooltipService: ITooltipService;
    private events: any;


    private host: powerbi.extensibility.visual.IVisualHost;
    private grandTotalRow: PnLRow | undefined;

    private collapsedRows: Set<string> = new Set();
    private contextMenu: HTMLDivElement;
    private settingsMenu: HTMLDivElement;
    private sortingState: { column: string, direction: 'asc' | 'desc' | 'none' } = { column: '', direction: 'none' };
    private viewMode: ViewMode;
    private columnFormatting: Record<string, ColumnFormatConfig> = {};
    private columnTotals: Record<string, number> = {}; // Store max values for databars
    private rowOrder: Record<string, string[]> = {}; // Map<ParentID, ChildIDs[]>
    private isManualSort: boolean = false;
    private calculatedRows: CalculatedRowConfig[] = [];
    private calculatedColumns: CalculatedColumnConfig[] = [];
    private invertedRows: Set<string> = new Set();
    // New property for column groups
    private columnGroups: ColumnGroup[] = [];

    private hasBudget: boolean = false;
    private hasPY: boolean = false;
    private hasForecast: boolean = false;

    private escapeHtml(value: unknown): string {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    private setNodeHtml(parent: HTMLElement, html: string) {
        const parser = new DOMParser();
        if (parent.tagName === "TABLE") {
            const doc = parser.parseFromString(`<table>${html}</table>`, "text/html");
            const table = doc.querySelector("table");
            parent.replaceChildren(...Array.from(table?.childNodes || []));
            return;
        }

        const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
        parent.replaceChildren(...Array.from(doc.body.childNodes));
    }

    private clearNode(node: HTMLElement) {
        node.replaceChildren();
    }

    private createRandomId(prefix: string): string {
        const bytes = new Uint32Array(2);
        window.crypto.getRandomValues(bytes);
        return `${prefix}_${Date.now()}_${bytes[0].toString(36)}${bytes[1].toString(36)}`;
    }

    private evaluateArithmeticExpression(expression: string): number | undefined {
        const normalized = expression.replace(/\s+/g, "");
        if (!normalized || !/^[\d.+\-*/()]+$/.test(normalized)) {
            return undefined;
        }

        const tokens = normalized.match(/\d*\.?\d+|[()+\-*/]/g);
        if (!tokens) {
            return undefined;
        }

        const values: number[] = [];
        const operators: string[] = [];
        const precedence = (operator: string) => (operator === "+" || operator === "-") ? 1 : 2;
        const applyOperator = () => {
            const operator = operators.pop();
            const right = values.pop();
            const left = values.pop();

            if (!operator || right == null || left == null) {
                throw new Error("Invalid expression");
            }

            switch (operator) {
                case "+":
                    values.push(left + right);
                    break;
                case "-":
                    values.push(left - right);
                    break;
                case "*":
                    values.push(left * right);
                    break;
                case "/":
                    values.push(right === 0 ? NaN : left / right);
                    break;
                default:
                    throw new Error("Unsupported operator");
            }
        };

        let previousToken: string | null = null;
        tokens.forEach((token) => {
            if (/^\d*\.?\d+$/.test(token)) {
                values.push(Number(token));
            } else if (token === "(") {
                operators.push(token);
            } else if (token === ")") {
                while (operators.length && operators[operators.length - 1] !== "(") {
                    applyOperator();
                }
                if (operators.pop() !== "(") {
                    throw new Error("Mismatched parentheses");
                }
            } else {
                const isUnary = token === "-" && (previousToken == null || ["(", "+", "-", "*", "/"].includes(previousToken));
                if (isUnary) {
                    values.push(0);
                }
                while (
                    operators.length &&
                    operators[operators.length - 1] !== "(" &&
                    precedence(operators[operators.length - 1]) >= precedence(token)
                ) {
                    applyOperator();
                }
                operators.push(token);
            }
            previousToken = token;
        });

        while (operators.length) {
            if (operators[operators.length - 1] === "(") {
                throw new Error("Mismatched parentheses");
            }
            applyOperator();
        }

        if (values.length !== 1) {
            return undefined;
        }

        const result = values[0];
        return Number.isFinite(result) ? result : undefined;
    }

    private isEditMode(): boolean {
        return this.viewMode === ViewMode.Edit || this.viewMode === ViewMode.InFocusEdit;
    }

    private updateContextMenuAuthoringState() {
        const isEditMode = this.isEditMode();
        this.contextMenu.querySelectorAll<HTMLElement>("[data-authoring-only='true']").forEach((item) => {
            item.style.display = isEditMode ? "" : "none";
        });

        this.contextMenu.querySelectorAll<HTMLElement>("[data-authoring-separator='true']").forEach((separator) => {
            separator.style.display = isEditMode ? "" : "none";
        });
    }

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.selectionManager = this.host.createSelectionManager();
        this.tooltipService = this.host.tooltipService;
        this.events = this.host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();
        this.target = options.element;

        // Create container
        this.container = document.createElement("div");
        this.container.style.cssText = "width:100%;height:100%;overflow:auto;font-family:Segoe UI,sans-serif;font-size:12px;position:relative;";
        this.target.appendChild(this.container);

        // ... existing constructor content (I will assume internal parts like context menu creation generated in step 189 are valid as they were viewed, not added by me. I only added lines 89-90 in step 101).
        // Wait, I cannot revert "internal parts" easily with replace_file_content if I don't copy them back.
        // I should use multi_replace to target specific blocks I changed.


        // Create Context Menu
        this.contextMenu = document.createElement("div");
        this.contextMenu.style.cssText = `
            display: none;
            position: fixed;
            z-index: 10000;
            background: #fff;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            border: 1px solid #ccc;
            padding: 3px 0;
            min-width: 120px;
            font-size: 11px;
        `;
        document.body.appendChild(this.contextMenu); // Attach to body to ensure top layer

        const menuItems = [
            { action: "expandAll", label: "Expand All", style: "padding:4px 12px;cursor:pointer;" },
            { action: "collapseAll", label: "Collapse All", style: "padding:4px 12px;cursor:pointer;" },
            { action: "", label: "", style: "border-top:1px solid #ccc;margin:3px 0;", authoringSeparator: true },
            { action: "createCalculation", label: "Create Calculated Row", style: "padding:4px 12px;cursor:pointer;", authoringOnly: true },
            { action: "editCalculation", label: "Edit Calculated Rows...", style: "padding:4px 12px;cursor:pointer;", authoringOnly: true },
            { action: "deleteRow", label: "Delete Row", style: "padding:4px 12px;cursor:pointer;display:none;color:red;", authoringOnly: true }
        ];
        menuItems.forEach((item) => {
            const div = document.createElement("div");
            div.style.cssText = item.style;
            if (item.action) {
                div.setAttribute("data-action", item.action);
            }
            if (item.authoringOnly) {
                div.setAttribute("data-authoring-only", "true");
            }
            if (item.authoringSeparator) {
                div.setAttribute("data-authoring-separator", "true");
            }
            if (item.label) {
                div.textContent = item.label;
            }
            this.contextMenu.appendChild(div);
        });

        // Use Event Delegation for robustness
        this.contextMenu.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            const action = target.getAttribute("data-action");
            if (!action) return;

            const editModeOnlyActions = new Set(["createCalculation", "editCalculation", "deleteRow", "addBlankRow"]);
            if (editModeOnlyActions.has(action) && !this.isEditMode()) {
                this.hideContextMenu();
                return;
            }

            if (action === "expandAll") this.expandAll();
            if (action === "collapseAll") this.collapseAll();
            if (action === "createCalculation") this.showCalculationDialog(undefined, this.contextMenu.getAttribute("data-target-id"));
            if (action === "editCalculation") this.showCalculatedRowSelector();
            if (action === "deleteRow") this.deleteRow(this.contextMenu.getAttribute("data-target-id"));
            if (action === "addBlankRow") this.addBlankRow(this.contextMenu.getAttribute("data-target-id"));
            if (action === "addBlankRow") this.addBlankRow(this.contextMenu.getAttribute("data-target-id"));

            this.hideContextMenu();
        });

        this.contextMenu.addEventListener("mouseover", (e) => {
            const target = e.target as HTMLElement;
            if (target.hasAttribute("data-action")) target.style.background = "#f0f0f0";
        });
        this.contextMenu.addEventListener("mouseout", (e) => {
            const target = e.target as HTMLElement;
            if (target.hasAttribute("data-action")) target.style.background = "#fff";
        });

        document.addEventListener("click", () => this.hideContextMenu());
        this.container.addEventListener("scroll", () => this.hideContextMenu());
        this.updateContextMenuAuthoringState();

        // Create Settings Menu
        this.settingsMenu = document.createElement("div");
        this.settingsMenu.style.cssText = `display:none;position:fixed;z-index:10001;background:#fff;border:1px solid #ccc;box-shadow:0 4px 8px rgba(0,0,0,0.2);min-width:150px;font-size:12px;`;
        document.body.appendChild(this.settingsMenu);

        // Inject Styles for Hover effects
        const style = document.createElement("style");
        style.textContent = `
            .visual-container .expand-icon { opacity: 0; transition: opacity 0.2s; }
            .visual-container:hover .expand-icon { opacity: 1; }

            /* Modern Button Styles */
            .modern-btn {
                border: 1px solid #e1dfdd;
                border-radius: 4px;
                background-color: #fff;
                color: #323130;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 11px;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .modern-btn:hover {
                background-color: #f3f2f1;
                border-color: #8a8886;
            }
            .modern-btn.primary {
                background-color: #0078d4;
                color: #fff;
                border: none;
            }
            .modern-btn.primary:hover {
                background-color: #106ebe;
            }
            .modern-btn.danger {
                background-color: #cb2d3e;
                color: #fff;
                border: none;
            }
            .modern-btn.danger:hover {
                background-color: #b01c2e;
            }

            .modern-btn:active {
                background-color: #edebe9;
                border-color: #8a8886;
                transform: scale(0.98);
            }
            .modern-btn.primary:active {
                background-color: #005a9e;
                transform: scale(0.98);
            }
            .modern-btn.danger:active {
                background-color: #a80000;
                transform: scale(0.98);
            }

            /* Operator / Field Pills */
            .modern-pill {
                border: 1px solid #e1dfdd;
                border-radius: 12px;
                background-color: #f3f2f1;
                color: #323130;
                padding: 3px 10px;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.1s;
                user-select: none;
            }
            .modern-pill:hover {
                background-color: #e1dfdd;
                border-color: #8a8886;
            }
            .modern-pill:active {
                background-color: #d2d0ce;
                transform: translateY(1px);
            }

            /* Square Icon Buttons */
            .modern-sq-btn {
                border: 1px solid #e1dfdd;
                border-radius: 4px;
                background-color: #f3f2f1;
                color: #323130;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                transition: all 0.1s;
                display: flex;
                align-items: center;
                justify-content: center;
                user-select: none;
            }
            .modern-sq-btn:hover {
                background-color: #e1dfdd;
                border-color: #8a8886;
            }
            .modern-sq-btn:active {
                background-color: #d2d0ce;
                transform: scale(0.95);
            }
            
            /* Menu Items */
            .modern-menu-item {
                padding: 6px 12px;
                cursor: pointer;
                background: #fff;
                transition: background 0.1s;
                color: #333;
            }
            .modern-menu-item:hover {
                background-color: #f0f0f0;
            }
            .modern-menu-item:active {
                background-color: #e0e0e0;
            }
        `;
        this.target.appendChild(style);
        this.container.classList.add("visual-container");
    }

    private expandAll() {
        this.collapsedRows.clear();
        this.render();
    }

    private showSettingsMenu(x: number, y: number, column: string) {
        if (!this.isEditMode()) {
            this.hideContextMenu();
            return;
        }

        this.clearNode(this.settingsMenu);

        // Option: Hide Column
        const hideBtn = document.createElement("div");
        hideBtn.className = "modern-menu-item";
        hideBtn.innerText = "Hide Column";
        hideBtn.onclick = () => {
            this.toggleColumnVisibility(column);
            this.hideContextMenu();
        };
        this.settingsMenu.appendChild(hideBtn);

        // Option: Formatting
        const fmtBtn = document.createElement("div");
        fmtBtn.className = "modern-menu-item";
        fmtBtn.innerText = "Formatting >";
        fmtBtn.onclick = (e) => {
            e.stopPropagation();
            this.showFormattingSubMenu(x + 150, y, column);
        };
        this.settingsMenu.appendChild(fmtBtn);

        // Separator
        const sep = document.createElement("div");
        sep.style.cssText = "border-top:1px solid #eee;margin:3px 0;";
        this.settingsMenu.appendChild(sep);

        // Option: Create Calculated Column
        const createColBtn = document.createElement("div");
        createColBtn.className = "modern-menu-item";
        createColBtn.innerText = "Create Calculated Column";
        createColBtn.onclick = () => {
            this.showCalculatedColumnDialog();
            this.hideSettingsMenu();
        };
        this.settingsMenu.appendChild(createColBtn);

        // Option: Edit Calculated Columns...
        const editColBtn = document.createElement("div");
        editColBtn.className = "modern-menu-item";
        editColBtn.innerText = "Edit Calculated Columns...";
        editColBtn.onclick = () => {
            this.showCalculatedColumnDialog(undefined, true);
            this.hideSettingsMenu();
        };
        this.settingsMenu.appendChild(editColBtn);

        // Position menu with boundary detection
        this.settingsMenu.style.display = "block";
        const menuWidth = this.settingsMenu.offsetWidth || 150;
        const menuHeight = this.settingsMenu.offsetHeight || 100;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let finalX = x;
        let finalY = y;

        // Check right boundary
        if (x + menuWidth > viewportWidth) {
            finalX = viewportWidth - menuWidth - 10;
        }

        // Check bottom boundary
        if (y + menuHeight > viewportHeight) {
            finalY = viewportHeight - menuHeight - 10;
        }

        this.settingsMenu.style.left = finalX + "px";
        this.settingsMenu.style.top = finalY + "px";
    }

    private showFormattingSubMenu(x: number, y: number, column: string) {
        if (!this.isEditMode()) {
            this.hideContextMenu();
            return;
        }

        // Simple prompt approach for now to avoid building complex sub-menu UI in vanilla JS in one go.
        // In a real app we'd build another div. Let's start with a simple prompt flow or a new menu div.
        // Let's create a temporary sub-menu div.
        const submenu = document.createElement("div");
        submenu.style.cssText = `position:fixed;z-index:10002;background:#fff;border:1px solid #ccc;box-shadow:0 4px 8px rgba(0,0,0,0.2);min-width:150px;font-size:12px;`;

        const options: { label: string, type: string, extra?: Partial<ColumnFormatConfig>, action: () => void, isSeparator?: boolean }[] = [
            { label: "Font (Sentiment)", type: "font", action: () => this.updateColumnFormat(column, { type: "font" }) },
            { label: "Background (Sentiment)", type: "background", action: () => this.updateColumnFormat(column, { type: "background" }) },
            { label: "Data Bar", type: "databar", extra: { showSentiment: false }, action: () => this.updateColumnFormat(column, { type: "databar", showSentiment: false }) },
            { label: "Sentiment Data Bar", type: "databar", extra: { showSentiment: true }, action: () => this.updateColumnFormat(column, { type: "databar", showSentiment: true }) },
            { label: "Sentiment Lollipop", type: "lollipop", action: () => this.updateColumnFormat(column, { type: "lollipop", showSentiment: true }) },
            { label: "Sentiment Arrows", type: "waterfall", action: () => this.updateColumnFormat(column, { type: "waterfall" }) },

            { label: "", type: "", action: () => { }, isSeparator: true },
            { label: "Clear Formatting", type: "text", action: () => this.updateColumnFormat(column, { type: "text", backgroundColor: undefined, fontColor: undefined, showSentiment: false }) }
        ];

        // Get current format for this column
        const currentFormat = this.columnFormatting[column] || {};
        const currentType = currentFormat.type; // Keep undefined if not set
        const currentShowSentiment = currentFormat.showSentiment || false;

        const title = document.createElement("div");
        title.innerText = "Format Type:";
        title.style.cssText = "padding:5px 10px;font-weight:bold;color:#666;";
        submenu.appendChild(title);

        options.forEach(opt => {
            // Handle separator
            if (opt.isSeparator) {
                const sep = document.createElement("div");
                sep.style.cssText = "border-top:1px solid #ccc;margin:4px 0;";
                submenu.appendChild(sep);
                return;
            }

            const d = document.createElement("div");

            // Determine if this option is currently selected
            // Only show selected if currentType is defined (something was explicitly set)
            let isSelected = false;
            if (currentType !== undefined && opt.type === currentType) {
                // For databar, also check showSentiment
                if (opt.type === "databar") {
                    isSelected = (opt.extra?.showSentiment === currentShowSentiment);
                } else {
                    isSelected = true;
                }
            }

            // Add checkmark for selected option
            const checkmark = isSelected ? "✓ " : "   ";
            d.innerText = checkmark + opt.label;
            d.style.cssText = `padding:6px 15px;cursor:pointer;${isSelected ? "font-weight:bold;background:#e6f2ff;" : ""}`;
            d.onmouseenter = () => d.style.background = isSelected ? "#cce0ff" : "#f0f0f0";
            d.onmouseleave = () => d.style.background = isSelected ? "#e6f2ff" : "#fff";
            d.onclick = () => {
                opt.action();
                document.body.removeChild(submenu);
                this.hideContextMenu();
            };
            submenu.appendChild(d);
        });

        // Add to body first to get dimensions
        document.body.appendChild(submenu);

        // Position with boundary detection
        const menuWidth = submenu.offsetWidth || 150;
        const menuHeight = submenu.offsetHeight || 200;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let finalX = x;
        let finalY = y;

        // Check right boundary - if submenu would overflow, position it to the left of the trigger
        if (x + menuWidth > viewportWidth) {
            finalX = x - menuWidth - 150; // 150 is the approximate width of the parent menu
            if (finalX < 0) finalX = 10; // Ensure it doesn't go off left edge
        }

        // Check bottom boundary
        if (y + menuHeight > viewportHeight) {
            finalY = viewportHeight - menuHeight - 10;
        }

        submenu.style.left = finalX + "px";
        submenu.style.top = finalY + "px";

        // Click outside to close (simplified)
        const closeHandler = () => {
            if (document.body.contains(submenu)) {
                document.body.removeChild(submenu);
            }
            document.removeEventListener("click", closeHandler);
        };
        setTimeout(() => document.addEventListener("click", closeHandler), 0);
    }

    private showCalculationDialog(editConfig?: CalculatedRowConfig, afterRowId?: string | null, showSelector?: boolean) {
        if (!this.isEditMode()) {
            return;
        }

        // Create modal
        const modal = document.createElement("div");
        modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:20000;display:flex;justify-content:center;align-items:center;";

        const content = document.createElement("div");
        content.style.cssText = "background:#fff;padding:16px;width:520px;border-radius:4px;box-shadow:0 0 10px rgba(0,0,0,0.3);position:relative;";

        // Build list of available variables (data rows + calculated rows)
        const dataRows = this.currentRows
            .filter(r => r.level === 0 && !r.isSubtotal && !r.isBlank)
            .map(r => r.label);

        const calculatedRowNames = this.calculatedRows
            .filter(c => !c.isBlank && c.name) // Exclude blank rows and ensure has name
            .map(c => c.name);

        const availableFields = [...dataRows, ...calculatedRowNames].filter(Boolean);

        // For edit mode with selector
        const calcRows = this.calculatedRows || [];
        const hasRows = calcRows.length > 0;
        let currentConfig = editConfig;

        const isEdit = !!editConfig || showSelector;
        const isBlankRow = currentConfig?.isBlank || false;
        const title = showSelector ? "Edit Calculated Row" : (editConfig ? "Edit Row" : "Create Row");
        const btnText = isEdit ? "Update" : "Save";
        const defaultName = currentConfig?.name || "";
        const defaultFormula = currentConfig?.formula || "";
        const defaultBold = currentConfig?.format?.bold ? "selected" : "";
        const defaultItalic = currentConfig?.format?.italic ? "selected" : "";
        const defaultUnderline = currentConfig?.format?.underline ? "selected" : "";
        const defaultOverline = currentConfig?.format?.overline ? "selected" : "";
        const defaultInvert = currentConfig?.format?.invertSign ? "selected" : "";
        const defaultPercentage = currentConfig?.format?.percentage ? "selected" : "";
        const defaultBg = currentConfig?.format?.backgroundColor || "#ffffff";

        // Row selector dropdown HTML (only for edit mode with selector)
        const selectorHtml = showSelector && hasRows ? `
            <div style="margin-bottom:10px;">
                <label style="display:block;font-weight:bold;font-size:11px;margin-bottom:3px;">Select Row:</label>
                <div style="display:flex;gap:6px;">
                    <select id="rowSelector" style="flex:1;padding:5px;font-size:12px;">
                        ${calcRows.map(r => `<option value="${this.escapeHtml(r.id)}" ${r.id === currentConfig?.id ? "selected" : ""}>${this.escapeHtml(r.isBlank || !r.name ? "(Blank Row)" : r.name)}</option>`).join("")}
                    </select>
                </div>
            </div>
        ` : "";

        const deleteBtnHtml = showSelector && hasRows ? `<button id="btnDelete" class="modern-btn danger" style="float:left;">Delete</button>` : "";

        // Added Checkboxes for Skip and Result
        const defaultSkip = currentConfig?.skip ? "checked" : "";
        const defaultResult = currentConfig?.result ? "checked" : "";

        this.setNodeHtml(content, `
            <h3 style="margin:0 0 10px 0;font-size:14px;">${title}</h3>
            <div style="display:flex;gap:12px;">
                <div style="flex:1;">
                    ${selectorHtml}
                    <div style="margin-bottom:6px;">
                        <label style="display:block;font-weight:bold;font-size:10px;margin-bottom:2px;">Name:</label>
                        <input type="text" id="calcName" value="${this.escapeHtml(defaultName)}" style="width:100%;padding:4px;font-size:11px;box-sizing:border-box;" placeholder="e.g. Margin (Leave empty for blank row)">
                    </div>
                    <div id="formulaSection" style="margin-bottom:6px;">
                        <label style="display:block;font-weight:bold;font-size:10px;margin-bottom:2px;">Formula:</label>
                        <input type="text" id="calcFormula" value="${this.escapeHtml(defaultFormula)}" style="width:100%;padding:4px;font-size:11px;box-sizing:border-box;" placeholder="e.g. Revenue - COGS (dependent on your fields). Leave empty for blank row." autocomplete="off">
                        <div id="autocompleteList" style="position:absolute;z-index:99;background:#fff;border:1px solid #ccc;max-height:100px;overflow-y:auto;display:none;width:calc(100% - 32px);"></div>
                    </div>
                    <div style="margin-bottom:6px;">
                        <label style="display:block;font-weight:bold;font-size:10px;margin-bottom:2px;">Format:</label>
                        <div style="display:flex;gap:2px;align-items:center;">
                            <button id="fmtBold" class="fmt-btn modern-sq-btn ${defaultBold}" title="Bold">B</button>
                            <button id="fmtItalic" class="fmt-btn modern-sq-btn ${defaultItalic}" title="Italic" style="font-style:italic;">I</button>
                            <button id="fmtUnderline" class="fmt-btn modern-sq-btn ${defaultUnderline}" title="Underline" style="text-decoration:underline;">U</button>
                            <button id="fmtOverline" class="fmt-btn modern-sq-btn ${defaultOverline}" title="Overline" style="border-top:2px solid #333;">O</button>
                            <div style="width:1px;height:18px;background:#e1dfdd;margin:0 4px;"></div>
                            <button id="fmtInvert" class="fmt-btn modern-sq-btn ${defaultInvert}" title="Invert Sign">±</button>
                            <button id="fmtPercentage" class="fmt-btn modern-sq-btn ${defaultPercentage}" title="Percentage">%</button>
                            <div style="width:1px;height:16px;background:#ccc;margin:0 2px;"></div>
                            <input type="color" id="fmtBgColor" value="${defaultBg}" title="Background" style="width:24px;height:24px;padding:0;border:1px solid #ccc;cursor:pointer;">
                        </div>
                    </div>
                     <div style="margin-bottom:6px;">
                        <label style="display:block;font-weight:bold;font-size:10px;margin-bottom:2px;">Options:</label>
                        <div style="display:flex;gap:10px;font-size:11px;">
                            <label><input type="checkbox" id="chkSkip" ${defaultSkip}> Skip (Exclude from totals)</label>
                            <label><input type="checkbox" id="chkResult" ${defaultResult}> Result (Subtotal)</label>
                        </div>
                    </div>
                </div>
                <div id="operatorsFieldsPanel" style="width:160px;">
                    <div style="font-size:10px;font-weight:bold;margin-bottom:3px;">Operators:</div>
                    <div id="operatorButtons" style="display:flex;gap:2px;flex-wrap:wrap;margin-bottom:6px;"></div>
                    <div style="font-size:10px;font-weight:bold;margin-bottom:3px;">Fields:</div>
                    <div id="fieldButtons" style="display:flex;gap:2px;flex-wrap:wrap;max-height:100px;overflow-y:auto;"></div>
                </div>
            </div>
            <div style="text-align:right;margin-top:10px;">
                ${deleteBtnHtml}
                <button id="btnCancel" class="modern-btn" style="margin-right:8px;padding:6px 14px;">Cancel</button>
                <button id="btnSave" class="modern-btn primary" style="padding:6px 14px;">${btnText}</button>
            </div>
            </div>
        `);

        modal.appendChild(content);
        document.body.appendChild(modal);

        const formulaInput = content.querySelector("#calcFormula") as HTMLInputElement;
        const autocompleteDiv = content.querySelector("#autocompleteList") as HTMLElement;
        const operatorButtonsDiv = content.querySelector("#operatorButtons") as HTMLElement;
        const fieldButtonsDiv = content.querySelector("#fieldButtons") as HTMLElement;

        // Create operator buttons
        const operators = ["+", "-", "*", "/", "(", ")"];
        operators.forEach(op => {
            const btn = document.createElement("button");
            btn.textContent = op;
            btn.className = "modern-sq-btn";
            btn.style.width = "26px"; // Enforce dimensions
            btn.style.height = "26px";
            btn.type = "button";
            btn.onclick = () => {
                const cursorPos = formulaInput.selectionStart || 0;
                const before = formulaInput.value.substring(0, cursorPos);
                const after = formulaInput.value.substring(cursorPos);
                formulaInput.value = before + ` ${op} ` + after;
                formulaInput.focus();
                formulaInput.setSelectionRange(cursorPos + op.length + 2, cursorPos + op.length + 2);
            };
            operatorButtonsDiv.appendChild(btn);
        });

        // Create clickable field buttons
        availableFields.forEach(field => {
            const btn = document.createElement("button");
            btn.textContent = field;
            btn.className = "modern-pill";
            btn.type = "button";
            btn.onclick = () => {
                const cursorPos = formulaInput.selectionStart || 0;
                const before = formulaInput.value.substring(0, cursorPos);
                const after = formulaInput.value.substring(cursorPos);
                formulaInput.value = before + `"${field}"` + after;
                formulaInput.focus();
                formulaInput.setSelectionRange(cursorPos + field.length + 2, cursorPos + field.length + 2);
            };
            fieldButtonsDiv.appendChild(btn);
        });

        // Autocomplete functionality
        formulaInput.addEventListener("input", () => {
            const val = formulaInput.value;
            const cursorPos = formulaInput.selectionStart || 0;

            // Find the current word being typed (look backwards from cursor)
            let startPos = cursorPos - 1;
            while (startPos >= 0 && /[a-zA-Z0-9]/.test(val[startPos])) {
                startPos--;
            }
            startPos++;

            const currentWord = val.substring(startPos, cursorPos);

            if (currentWord.length > 0) {
                const matches = availableFields.filter(f =>
                    f.toLowerCase().startsWith(currentWord.toLowerCase())
                );

                if (matches.length > 0) {
                    this.setNodeHtml(
                        autocompleteDiv,
                        matches.map(m =>
                            `<div style="padding:5px 10px;cursor:pointer;" data-field="${this.escapeHtml(m)}">${this.escapeHtml(m)}</div>`
                        ).join("")
                    );
                    autocompleteDiv.style.display = "block";

                    autocompleteDiv.querySelectorAll("div").forEach(div => {
                        div.onmouseenter = () => div.style.background = "#f0f0f0";
                        div.onmouseleave = () => div.style.background = "#fff";
                        div.onclick = () => {
                            const field = div.getAttribute("data-field")!;
                            const before = val.substring(0, startPos);
                            const after = val.substring(cursorPos);
                            formulaInput.value = before + `"${field}"` + after;
                            autocompleteDiv.style.display = "none";
                            formulaInput.focus();
                            formulaInput.setSelectionRange(startPos + field.length + 2, startPos + field.length + 2);
                        };
                    });
                } else {
                    autocompleteDiv.style.display = "none";
                }
            } else {
                autocompleteDiv.style.display = "none";
            }
        });

        // Hide autocomplete when clicking outside
        formulaInput.addEventListener("blur", () => {
            setTimeout(() => autocompleteDiv.style.display = "none", 200);
        });



        // Row selector for edit mode
        const rowSelector = content.querySelector("#rowSelector") as HTMLSelectElement;
        const nameInput = content.querySelector("#calcName") as HTMLInputElement;
        let activeConfigId = currentConfig?.id;

        if (rowSelector && showSelector) {
            // Load first row if no config provided
            if (!currentConfig && calcRows.length > 0) {
                activeConfigId = calcRows[0].id;
                loadRowData(calcRows[0]);
            } else if (currentConfig) {
                loadRowData(currentConfig);
            }

            rowSelector.addEventListener("change", () => {
                const selectedId = rowSelector.value;
                const selectedConfig = calcRows.find(r => r.id === selectedId);
                if (selectedConfig) {
                    activeConfigId = selectedId;
                    loadRowData(selectedConfig);
                }
            });
        }

        function loadRowData(config: CalculatedRowConfig) {
            nameInput.value = config.name || "";
            formulaInput.value = config.formula || "";

            const skipBox = content.querySelector("#chkSkip") as HTMLInputElement;
            const resultBox = content.querySelector("#chkResult") as HTMLInputElement;
            if (skipBox) skipBox.checked = !!config.skip;
            if (resultBox) resultBox.checked = !!config.result;

            // Update format buttons
            const updateFmtBtn = (id: string, active: boolean) => {
                const btn = content.querySelector(`#${id}`) as HTMLButtonElement;
                if (btn) {
                    btn.classList.toggle('selected', active);
                    btn.style.background = active ? '#e0e0e0' : '#fff';
                }
            };
            updateFmtBtn('fmtBold', config.format?.bold || false);
            updateFmtBtn('fmtItalic', config.format?.italic || false);
            updateFmtBtn('fmtUnderline', config.format?.underline || false);
            updateFmtBtn('fmtOverline', config.format?.overline || false);
            updateFmtBtn('fmtInvert', config.format?.invertSign || false);
            updateFmtBtn('fmtPercentage', config.format?.percentage || false);

            const bgInput = content.querySelector("#fmtBgColor") as HTMLInputElement;
            if (bgInput) bgInput.value = config.format?.backgroundColor || "#ffffff";


        }

        // Delete button handler
        const deleteBtn = content.querySelector("#btnDelete") as HTMLButtonElement;
        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => {
                if (deleteBtn.innerText === "Delete") {
                    deleteBtn.innerText = "Confirm?";
                    deleteBtn.style.backgroundColor = "#a80000";
                    setTimeout(() => {
                        deleteBtn.innerText = "Delete";
                        deleteBtn.style.backgroundColor = "#d9534f";
                    }, 3000);
                } else {
                    if (activeConfigId) {
                        this.deleteRow(activeConfigId);
                        close();
                    }
                }
            });
        }

        // Format button toggles
        const fmtButtons = ['fmtBold', 'fmtItalic', 'fmtUnderline', 'fmtOverline', 'fmtInvert', 'fmtPercentage'];
        fmtButtons.forEach(id => {
            const btn = content.querySelector(`#${id}`) as HTMLButtonElement;
            if (btn) {
                btn.addEventListener("click", () => {
                    const isSelected = btn.classList.contains('selected');
                    if (isSelected) {
                        btn.classList.remove('selected');
                        btn.style.background = '#fff';
                    } else {
                        btn.classList.add('selected');
                        btn.style.background = '#e0e0e0';
                    }
                });
                // Apply initial selection styling
                if (btn.classList.contains('selected')) {
                    btn.style.background = '#e0e0e0';
                }
            }
        });

        // Events
        const close = () => document.body.removeChild(modal);

        content.querySelector("#btnCancel")?.addEventListener("click", close);
        content.querySelector("#btnSave")?.addEventListener("click", () => {
            const name = (content.querySelector("#calcName") as HTMLInputElement).value.trim();
            const formula = (content.querySelector("#calcFormula") as HTMLInputElement).value.trim();
            const skip = (content.querySelector("#chkSkip") as HTMLInputElement)?.checked || false;
            const result = (content.querySelector("#chkResult") as HTMLInputElement)?.checked || false;

            const format: CalculatedRowFormat = {
                bold: content.querySelector("#fmtBold")?.classList.contains('selected') || false,
                italic: content.querySelector("#fmtItalic")?.classList.contains('selected') || false,
                underline: content.querySelector("#fmtUnderline")?.classList.contains('selected') || false,
                overline: content.querySelector("#fmtOverline")?.classList.contains('selected') || false,
                invertSign: content.querySelector("#fmtInvert")?.classList.contains('selected') || false,
                percentage: content.querySelector("#fmtPercentage")?.classList.contains('selected') || false,
                backgroundColor: (content.querySelector("#fmtBgColor") as HTMLInputElement).value
            };

            // Determine which config ID to use for updates
            const targetId = showSelector ? activeConfigId : editConfig?.id;
            const targetConfig = targetId ? this.calculatedRows.find(r => r.id === targetId) : null;

            // Blank row mode - name and formula empty
            if (!name && !formula) {
                if (targetConfig) {
                    const idx = this.calculatedRows.findIndex(r => r.id === targetId);
                    if (idx >= 0) {
                        this.calculatedRows[idx] = { ...targetConfig, name: "", formula: "", format, isBlank: true };
                        this.persistCalculatedRows();
                    }
                } else {
                    this.addBlankRow(afterRowId);
                }
                close();
                return;
            }

            // Formula row mode - need name and formula
            if (name && formula) {
                if (targetConfig) {
                    const idx = this.calculatedRows.findIndex(r => r.id === targetId);
                    if (idx >= 0) {
                        this.calculatedRows[idx] = { ...targetConfig, name, formula, format, isBlank: false, skip, result };
                        this.persistCalculatedRows();
                    }
                } else {
                    this.addCalculatedRow(name, formula, format, afterRowId, skip, result);
                }
                close();
            } else {
                alert("Please enter both Name and Formula, or leave both empty for a Blank Row.");
            }
        });
    }

    private persistCalculatedRows() {
        this.host.persistProperties({
            merge: [{
                objectName: "layoutSettings",
                properties: {
                    calculatedRows: JSON.stringify(this.calculatedRows)
                },
                selector: null
            }]
        });
    }


    private editCalculation(id: string | null) {
        if (!id) return;
        const config = this.calculatedRows.find(r => r.id === id);
        if (config) {
            this.showCalculationDialog(config);
        }
    }

    private showCalculatedRowSelector() {
        if (!this.isEditMode()) {
            return;
        }

        // Filter out blank rows, only show actual calculated rows
        const calcRows = this.calculatedRows.filter(r => !r.isBlank);

        if (calcRows.length === 0) {
            alert("No calculated rows to edit. Create one first.");
            return;
        }

        // Open the combined dialog with selector mode
        this.showCalculationDialog(calcRows[0], null, true);
    }

    private deleteRow(id: string | null) {
        if (!this.isEditMode()) {
            return;
        }

        if (!id) return;
        const initLength = this.calculatedRows.length;
        this.calculatedRows = this.calculatedRows.filter(r => r.id !== id);
        if (this.calculatedRows.length !== initLength) {
            this.persistCalculatedRows();
        }
    }



    // --- Calculated Columns ---
    private evaluateColumnFormula(formula: string, row: PnLRow): number | undefined {
        // Formula parser supports:
        // - [columnName] - current row's column value
        // - {RowName}[columnName] - specific row's column value
        try {
            let expr = formula;

            // First, replace row-specific references like {Revenue}[actualCY]
            const rowRefRegex = /\{([^}]+)\}\[([^\]]+)\]/gi;
            expr = expr.replace(rowRefRegex, (match, rowName, colName) => {
                const targetRow = this.findRowByLabel(rowName);
                if (!targetRow) return "0";
                return String(this.getRowColumnValue(targetRow, colName) ?? 0);
            });

            // Then, replace current row column references
            expr = expr.replace(/\[actualCY\]/gi, String(row.actualCY ?? 0));
            expr = expr.replace(/\[actualPY\]/gi, String(row.actualPY ?? 0));
            expr = expr.replace(/\[budget\]/gi, String(row.budget ?? 0));
            expr = expr.replace(/\[varCYPY\]/gi, String(row.varCYPY ?? 0));
            expr = expr.replace(/\[varCYPYPct\]/gi, String(row.varCYPYPct ?? 0));
            expr = expr.replace(/\[varCYBud\]/gi, String(row.varCYBud ?? 0));
            expr = expr.replace(/\[varCYBudPct\]/gi, String(row.varCYBudPct ?? 0));

            const result = this.evaluateArithmeticExpression(expr);
            return typeof result === 'number' && isFinite(result) ? result : undefined;
        } catch (e) {
            console.error("Formula evaluation error:", e);
            return undefined;
        }
    }

    private findRowByLabel(label: string): PnLRow | undefined {
        const search = (rows: PnLRow[]): PnLRow | undefined => {
            for (const r of rows) {
                if (r.label.toLowerCase() === label.toLowerCase()) return r;
                if (r.children.length > 0) {
                    const found = search(r.children);
                    if (found) return found;
                }
            }
            return undefined;
        };
        return search(this.currentRows);
    }

    private getRowColumnValue(row: PnLRow, colName: string): number | undefined {
        const col = colName.toLowerCase();
        if (col === "actualcy") return row.actualCY;
        if (col === "actualpy") return row.actualPY;
        if (col === "budget") return row.budget;
        if (col === "varcypy") return row.varCYPY;
        if (col === "varcypypct") return row.varCYPYPct;
        if (col === "varcybud") return row.varCYBud;
        if (col === "varcybudpct") return row.varCYBudPct;
        return undefined;
    }

    private persistCalculatedColumns() {
        this.host.persistProperties({
            merge: [{
                objectName: "layoutSettings",
                properties: {
                    calculatedColumns: JSON.stringify(this.calculatedColumns)
                },
                selector: null
            }]
        });
    }

    private addCalculatedColumn(name: string, formula: string, format?: CalculatedRowFormat) {
        const id = "calccol_" + Date.now();
        this.calculatedColumns.push({ name, formula, id, format });
        this.persistCalculatedColumns();
    }

    private showCalculatedColumnDialog(editConfig?: CalculatedColumnConfig, showSelector: boolean = false) {
        if (!this.isEditMode()) {
            return;
        }

        // Allow opening even if no columns - effectively becomes "Create" mode or just empty state
        // if (showSelector && this.calculatedColumns.length === 0) {
        //     alert("No calculated columns to edit. Create one first.");
        //     return;
        // }

        const modal = document.createElement("div");
        modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:20000;display:flex;justify-content:center;align-items:center;";

        const content = document.createElement("div");
        content.style.cssText = "background:#fff;padding:20px;width:500px;border-radius:4px;box-shadow:0 0 10px rgba(0,0,0,0.3);position:relative;";

        // Setup current state
        const calcCols = this.calculatedColumns || [];
        const hasCols = calcCols.length > 0;
        let currentConfig = editConfig;

        // If in selector mode and no config passed, default to first
        if (showSelector && !currentConfig && hasCols) {
            currentConfig = calcCols[0];
        }

        const isEdit = !!currentConfig || showSelector;
        const title = showSelector ? "Edit Calculated Column" : (isEdit ? "Edit Column" : "Create Calculated Column");
        const btnText = isEdit ? "Update" : "Save";

        // Defaults
        const defaultName = currentConfig ? currentConfig.name : "";
        const defaultFormula = currentConfig ? currentConfig.formula : "";
        const defaultPercentage = currentConfig && currentConfig.format?.percentage ? "checked" : "";

        // Selector HTML
        const selectorHtml = showSelector && hasCols ? `
            <div style="margin-bottom:10px;">
                <label style="display:block;font-weight:bold;font-size:11px;margin-bottom:3px;">Select Column:</label>
                <div style="display:flex;gap:6px;">
                    <select id="colSelector" style="flex:1;padding:5px;font-size:12px;">
                        ${calcCols.map(c => `<option value="${this.escapeHtml(c.id)}" ${currentConfig && c.id === currentConfig.id ? "selected" : ""}>${this.escapeHtml(c.name || "(Unnamed)")}</option>`).join("")}
                    </select>
                </div>
            </div>
        ` : "";

        const deleteBtnHtml = showSelector && hasCols ? `<button id="btnDelete" class="modern-btn danger" style="float:left;">Delete</button>` : "";

        const availableFields = ["actualCY", "actualPY", "budget", "varCYPY", "varCYPYPct", "varCYBud", "varCYBudPct"];

        this.setNodeHtml(content, `
            <h3 style="margin:0 0 10px 0;font-size:14px;">${title}</h3>
            <div style="display:flex;gap:12px;">
                <div style="flex:1;">
                    ${selectorHtml}
                    <div style="margin-bottom:6px;">
                        <label style="display:block;font-weight:bold;font-size:10px;margin-bottom:2px;">Column Name:</label>
                        <input type="text" id="colName" value="${this.escapeHtml(defaultName)}" style="width:100%;padding:4px;font-size:11px;box-sizing:border-box;" placeholder="e.g. Margin %">
                    </div>
                    <div style="margin-bottom:6px;position:relative;">
                        <label style="display:block;font-weight:bold;font-size:10px;margin-bottom:2px;">Formula:</label>
                        <input type="text" id="colFormula" value="${this.escapeHtml(defaultFormula)}" style="width:100%;padding:4px;font-size:11px;box-sizing:border-box;" placeholder="e.g. [actualCY] / {Revenue}[actualCY]" autocomplete="off">
                        <div id="autocompleteList" style="position:absolute;z-index:99;background:#fff;border:1px solid #ccc;max-height:100px;overflow-y:auto;display:none;width:calc(100% - 32px);"></div>
                    </div>
                    <div style="margin-bottom:6px;">
                        <label><input type="checkbox" id="fmtPercentage" ${defaultPercentage} style="vertical-align:middle;"> <span style="font-size:11px;vertical-align:middle;">Format as Percentage</span></label>
                    </div>
                </div>
                <div id="operatorsFieldsPanel" style="width:160px;display:flex;flex-direction:column;gap:6px;">
                    <div>
                        <div style="font-size:10px;font-weight:bold;margin-bottom:3px;">Operators:</div>
                        <div id="operatorButtons" style="display:flex;gap:2px;flex-wrap:wrap;"></div>
                    </div>
                    <div style="flex:1;min-height:0;display:flex;flex-direction:column;">
                        <div style="font-size:10px;font-weight:bold;margin-bottom:3px;">Fields:</div>
                        <div style="overflow-y:auto;flex:1;">
                            <div style="font-size:9px;color:#666;margin-bottom:2px;">Cols [current row]:</div>
                            <div id="fieldButtons" style="display:flex;gap:2px;flex-wrap:wrap;margin-bottom:6px;"></div>
                            <div style="font-size:9px;color:#666;margin-bottom:2px;">Rows {specific row}:</div>
                            <div id="rowButtons" style="display:flex;gap:2px;flex-wrap:wrap;"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div style="text-align:right;margin-top:10px;">
                ${deleteBtnHtml}
                <button id="btnCancel" class="modern-btn" style="margin-right:8px;padding:6px 14px;">Cancel</button>
                <button id="btnSave" class="modern-btn primary" style="padding:6px 14px;">${btnText}</button>
            </div>
        `);

        modal.appendChild(content);
        document.body.appendChild(modal);

        const nameInput = content.querySelector("#colName") as HTMLInputElement;
        const formulaInput = content.querySelector("#colFormula") as HTMLInputElement;
        const percentageInput = content.querySelector("#fmtPercentage") as HTMLInputElement;
        const autocompleteDiv = content.querySelector("#autocompleteList") as HTMLElement;
        const operatorButtonsDiv = content.querySelector("#operatorButtons") as HTMLElement;
        const fieldButtonsDiv = content.querySelector("#fieldButtons") as HTMLElement;
        const rowSelector = content.querySelector("#colSelector") as HTMLSelectElement;

        let activeConfigId = currentConfig?.id;

        // --- Logic to Load Data ---
        function loadColumnData(config: CalculatedColumnConfig) {
            nameInput.value = config.name || "";
            formulaInput.value = config.formula || "";
            percentageInput.checked = !!config.format?.percentage;
        }

        if (showSelector && rowSelector) {
            rowSelector.addEventListener("change", () => {
                const selectedId = rowSelector.value;
                const selectedConfig = calcCols.find(c => c.id === selectedId);
                if (selectedConfig) {
                    activeConfigId = selectedId;
                    loadColumnData(selectedConfig);
                }
            });
        }

        // --- Helper: Insert Text ---
        const insertText = (text: string, offset: number = 0) => {
            const cursorPos = formulaInput.selectionStart || 0;
            const before = formulaInput.value.substring(0, cursorPos);
            const after = formulaInput.value.substring(cursorPos);
            formulaInput.value = before + text + after;
            formulaInput.focus();
            const newPos = cursorPos + text.length + offset;
            formulaInput.setSelectionRange(newPos, newPos);
        };

        // Create operator buttons
        const operators = ["+", "-", "*", "/", "(", ")"];
        operators.forEach(op => {
            const btn = document.createElement("button");
            btn.textContent = op;
            btn.className = "modern-sq-btn";
            btn.style.width = "26px";
            btn.style.height = "26px";
            btn.type = "button";
            btn.onclick = () => insertText(` ${op} `);
            operatorButtonsDiv.appendChild(btn);
        });

        // Create clickable field buttons
        availableFields.forEach(field => {
            const btn = document.createElement("button");
            btn.textContent = field;
            btn.className = "modern-pill";
            btn.type = "button";
            btn.onclick = () => insertText(`[${field}]`);
            fieldButtonsDiv.appendChild(btn);
        });

        // Autocomplete functionality
        formulaInput.addEventListener("input", () => {
            const val = formulaInput.value;
            const cursorPos = formulaInput.selectionStart || 0;

            // Find the current word being typed (look backwards from cursor)
            let startPos = cursorPos - 1;
            while (startPos >= 0 && /[a-zA-Z0-9]/.test(val[startPos])) {
                startPos--;
            }
            startPos++;

            const currentWord = val.substring(startPos, cursorPos);

            if (currentWord.length > 0) {
                const matches = availableFields.filter(f =>
                    f.toLowerCase().startsWith(currentWord.toLowerCase())
                );

                if (matches.length > 0) {
                    this.setNodeHtml(
                        autocompleteDiv,
                        matches.map(m =>
                            `<div class="modern-menu-item" data-field="${this.escapeHtml(m)}">${this.escapeHtml(m)}</div>`
                        ).join("")
                    );
                    autocompleteDiv.style.display = "block";

                    autocompleteDiv.querySelectorAll("div").forEach(div => {
                        // hover handled by css
                        div.onclick = () => {
                            const field = div.getAttribute("data-field")!;
                            const before = val.substring(0, startPos);
                            const after = val.substring(cursorPos);
                            formulaInput.value = before + `"${field}"` + after;
                            autocompleteDiv.style.display = "none";
                            formulaInput.focus();
                            const newPos = startPos + field.length + 2;
                            formulaInput.setSelectionRange(newPos, newPos);
                        };
                    });
                } else {
                    autocompleteDiv.style.display = "none";
                }
            } else {
                autocompleteDiv.style.display = "none";
            }
        });

        // Hide autocomplete when clicking outside
        formulaInput.addEventListener("blur", () => {
            setTimeout(() => autocompleteDiv.style.display = "none", 200);
        });

        // --- Row References ({RowName}) ---
        const rowButtonsDiv = content.querySelector("#rowButtons") as HTMLElement;

        // Helper to flatten rows
        const getAllRows = (nodes: PnLRow[]): PnLRow[] => {
            let list: PnLRow[] = [];
            nodes.forEach(n => {
                list.push(n);
                if (n.children && n.children.length > 0) list = list.concat(getAllRows(n.children));
            });
            return list;
        };
        const flatRows = getAllRows(this.currentRows.filter(r => r.level === 0)); // Only root rows for simpler UI? Or all? User might want sub-rows.
        // Actually, let's just supply root rows and maybe commonly used ones. Or better, all rows (excluding subtotals perhaps?)
        // Let's stick to root rows + calculated rows (filtered).
        // Actually the original implementation (if existed) or logic should be:
        const refRows = [...this.currentRows.filter(r => !r.isSubtotal), ...this.calculatedRows];

        refRows.forEach(r => {
            // simplified button loop
            if (!(r as any).name && !(r as any).label) return;
            const label = (r as any).name || (r as any).label;
            const btn = document.createElement("button");
            btn.textContent = label;
            btn.style.cssText = "padding:3px 10px;background:#f3f2f1;border:1px solid #e1dfdd;border-radius:12px;cursor:pointer;font-size:11px;color:#323130;";
            btn.type = "button";
            btn.onclick = () => insertText(`{${label}}`);
            rowButtonsDiv.appendChild(btn);
        });


        const close = () => document.body.removeChild(modal);

        content.querySelector("#btnCancel")?.addEventListener("click", close);

        // Delete Handler
        content.querySelector("#btnDelete")?.addEventListener("click", (e) => {
            const btn = e.target as HTMLButtonElement;
            if (btn.innerText === "Delete") {
                btn.innerText = "Confirm?";
                btn.style.backgroundColor = "#a80000";
                setTimeout(() => {
                    btn.innerText = "Delete";
                    btn.style.backgroundColor = "#d9534f";
                }, 3000);
            } else {
                if (!activeConfigId) return;
                this.calculatedColumns = this.calculatedColumns.filter(c => c.id !== activeConfigId);
                this.persistCalculatedColumns();
                close();
            }
        });

        content.querySelector("#btnSave")?.addEventListener("click", () => {
            const name = nameInput.value.trim();
            const formula = formulaInput.value.trim();
            const isPct = percentageInput.checked;

            if (!name) { alert("Please enter a column name."); return; }
            if (!formula) { alert("Please enter a formula."); return; }

            if (isEdit && activeConfigId) {
                // Update existing
                const idx = this.calculatedColumns.findIndex(c => c.id === activeConfigId);
                if (idx >= 0) {
                    this.calculatedColumns[idx] = {
                        ...this.calculatedColumns[idx],
                        name,
                        formula,
                        format: { ...this.calculatedColumns[idx].format, percentage: isPct }
                    };
                }
            } else {
                // Create new
                const newCol: CalculatedColumnConfig = {
                    id: "col_" + Date.now(),
                    name,
                    formula,
                    format: { percentage: isPct }
                };
                this.calculatedColumns.push(newCol);
            }

            this.persistCalculatedColumns();
            close();
        });
    }
    private addBlankRow(afterRowId?: string | null) {
        const id = this.createRandomId("blank");
        const newRow = {
            id: id,
            name: "", // Initial name empty for blank row
            formula: "0",
            isBlank: true
        };

        // Insert after specific row if provided
        if (afterRowId) {
            const idx = this.calculatedRows.findIndex(r => r.id === afterRowId);
            if (idx >= 0) {
                this.calculatedRows.splice(idx + 1, 0, newRow);
            } else {
                this.calculatedRows.push(newRow);
            }
        } else {
            this.calculatedRows.push(newRow);
        }

        this.persistCalculatedRows();
    }

    private addCalculatedRow(name: string, formula: string, format?: CalculatedRowFormat, afterRowId?: string | null, skip?: boolean, result?: boolean) {
        // Add to state
        const id = "calc_" + Date.now();
        const newRow = { name, formula, id, format, skip, result };

        // Insert after specific row if provided
        if (afterRowId) {
            const idx = this.calculatedRows.findIndex(r => r.id === afterRowId);
            if (idx >= 0) {
                this.calculatedRows.splice(idx + 1, 0, newRow);
            } else {
                this.calculatedRows.push(newRow);
            }
        } else {
            this.calculatedRows.push(newRow);
        }

        // Persist
        this.host.persistProperties({
            merge: [{
                objectName: "layoutSettings",
                properties: {
                    calculatedRows: JSON.stringify(this.calculatedRows)
                },
                selector: null
            }]
        });

        // Re-run injection (or wait for update)
        // Since persist triggers update, we usually wait. But for immediate feedback? 
        // We'll rely on the update loop.
    }

    private updateColumnFormat(column: string, update: Partial<ColumnFormatConfig>) {
        // When switching types, we generally want to reset optional flags like showSentiment unless explicitly provided.
        // So we shouldn't just merge everything blindly if the type changes.

        let currentRef = this.columnFormatting[column] || {};

        // If type stays same, merge. If type changes, maybe we should be cleaner?
        // But simpler: just ensure we overwrite 'showSentiment' to false if not provided in update?
        // Or better: Construct new config based on what we want to persist.

        let newConfig: ColumnFormatConfig;

        if (update.type && update.type !== currentRef.type) {
            // Type change: Start fresh with the new update, ignoring old flags.
            newConfig = { type: update.type } as ColumnFormatConfig;
            // Copy over valid optional props if they are in the update
            if (update.showSentiment !== undefined) newConfig.showSentiment = update.showSentiment;
            if (update.databarColor !== undefined) newConfig.databarColor = update.databarColor;
            if (update.backgroundColor !== undefined) newConfig.backgroundColor = update.backgroundColor;
            if (update.fontColor !== undefined) newConfig.fontColor = update.fontColor;
        } else {
            // Same type (or just updating a property), merge.
            newConfig = { ...currentRef, ...update };
        }

        // Always persist the config, even if it's just { type: "text" }
        // This ensures "Clear Formatting" works for Pct columns that have default sentiment
        this.columnFormatting[column] = newConfig;

        this.host.persistProperties({
            merge: [{
                objectName: "layoutSettings",
                properties: {
                    columnFormatting: JSON.stringify(this.columnFormatting)
                },
                selector: null
            }]
        });

    }

    private toggleColumnVisibility(column: string) {
        if (!this.isEditMode()) {
            return;
        }

        const map: Record<string, string> = {
            "actualCY": "showActualCY",
            "actualPY": "showActualPY",
            "budget": "showBudget",
            "forecast": "showForecast",
            "varCYPY": "showVarCYPY",
            "varCYPYPct": "showVarCYPYPct",
            "varCYBud": "showVarCYBud",
            "varCYBudPct": "showVarCYBudPct",
            "varCYFcst": "showVarCYFcst",
            "varCYFcstPct": "showVarCYFcstPct"
        };
        const propName = map[column];
        if (!propName) return;

        this.host.persistProperties({
            merge: [{
                objectName: "columnVisibility",
                properties: {
                    [propName]: false // We only support "Hide" here, user can unhide from pane
                },
                selector: null
            }]
        });
    }

    private collapseAll() {
        const collectIds = (rows: PnLRow[]): string[] => {
            let ids: string[] = [];
            rows.forEach(r => {
                if (r.children && r.children.length > 0) {
                    ids.push(r.id);
                    ids = ids.concat(collectIds(r.children));
                }
            });
            return ids;
        };
        const allIds = collectIds(this.currentRows); // Collect from currently visible tree usually, or full tree?
        // Logic: Collapse All usually means everything is collapsed.
        allIds.forEach(id => this.collapsedRows.add(id));
        this.render();
    }

    private hideContextMenu() {
        this.contextMenu.style.display = "none";
        this.settingsMenu.style.display = "none";
    }

    private toggleInvertRow(id?: string | null) {
        if (!id) return;
        if (this.invertedRows.has(id)) {
            this.invertedRows.delete(id);
        } else {
            this.invertedRows.add(id);
        }

        // Persist
        this.host.persistProperties({
            merge: [{
                objectName: "layoutSettings",
                properties: {
                    invertedRows: JSON.stringify(Array.from(this.invertedRows))
                },
                selector: null
            }]
        });
        // Rendering will happen on update
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        this.viewMode = options.viewMode;
        this.updateContextMenuAuthoringState();

        // Check for data
        if (!options.dataViews || !options.dataViews[0] || !options.dataViews[0].matrix) {
            this.handleLandingPage(options);
            this.events.renderingFinished(options);
            return;
        }

        const dataView = options.dataViews[0];

        // Check if empty
        if (!dataView.matrix.rows || !dataView.matrix.rows.root || !dataView.matrix.rows.root.children || dataView.matrix.rows.root.children.length === 0) {
            this.handleLandingPage(options);
            this.events.renderingFinished(options);
            return;
        }

        // Clear landing page if it exists
        this.container.style.display = "block";

        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);


        // Apply dynamic visibility for Border Settings
        const gridLines = this.formattingSettings.gridlineSettings.gridLinesGroup;
        const borders = this.formattingSettings.gridlineSettings.bordersGroup;

        const section = borders.borderSection.value.value;
        const isRow = section === "row";
        const isCol = section === "col";
        const isVal = section === "val";
        const isGrp = section === "group";

        borders.rbTop.visible = borders.rbBottom.visible = borders.rbLeft.visible = borders.rbRight.visible = borders.rbColor.visible = borders.rbWidth.visible = isRow;
        borders.cbTop.visible = borders.cbBottom.visible = borders.cbLeft.visible = borders.cbRight.visible = borders.cbColor.visible = borders.cbWidth.visible = isCol;
        borders.vbTop.visible = borders.vbBottom.visible = borders.vbLeft.visible = borders.vbRight.visible = borders.vbColor.visible = borders.vbWidth.visible = isVal;
        borders.gbTop.visible = borders.gbBottom.visible = borders.gbLeft.visible = borders.gbRight.visible = borders.gbColor.visible = borders.gbWidth.visible = isGrp;

        // [PATCH] Manually populate hidden JSON settings from metadata
        const objects = options.dataViews[0]?.metadata?.objects;
        if (objects && objects["layoutSettings"]) {
            const layout = this.formattingSettings.layoutSettings;
            const hiddenProps = ["columnOrder", "columnFormatting", "rowOrder", "calculatedRows", "invertedRows", "calculatedColumns"];
            hiddenProps.forEach(prop => {
                const val = objects["layoutSettings"][prop];
                if (val !== undefined && (layout as any)[prop]) {
                    (layout as any)[prop].value = val;
                }
            });
        }

        const matrix = options.dataViews[0].matrix;

        // Check for presence of roles
        const columns = options.dataViews[0].metadata.columns;
        this.hasBudget = columns.some(c => c.roles && c.roles["budget"]);
        this.hasPY = columns.some(c => c.roles && c.roles["actualPY"]);
        this.hasForecast = columns.some(c => c.roles && c.roles["forecast"]);

        // [NEW] Check for Column Grouping
        const colRoot = matrix.columns.root;
        this.columnGroups = [];
        if (colRoot && colRoot.children && colRoot.children.length > 0) {
            const isGrouped = columns.some(c => c.roles && c.roles["columns"]);
            if (isGrouped) {
                // Filter out subtotals and handle null/blank names
                this.columnGroups = colRoot.children
                    .filter(child => !child.isSubtotal)
                    .map(child => {
                        const val = child.value;
                        const name = (val == null || val === "") ? "(Blank)" : String(val);
                        return {
                            name: name,
                            displayName: name
                        };
                    });
            }
        }

        this.currentRows = this.parseRows(dataView.matrix);

        // Parse Column Formatting
        try {
            const fmtJson = this.formattingSettings.layoutSettings.columnFormatting.value;
            this.columnFormatting = fmtJson ? JSON.parse(fmtJson) : {};
        } catch (e) {
            this.columnFormatting = {};
        }

        // Parse Row Order
        try {
            const rowOrderJson = this.formattingSettings.layoutSettings.rowOrder.value;
            this.rowOrder = rowOrderJson ? JSON.parse(rowOrderJson) : {};
            if (Object.keys(this.rowOrder).length > 0) {
                this.isManualSort = true;
            }
        } catch (e) {
            this.rowOrder = {};
        }

        // Parse Calculated Rows
        try {
            const calcRowsJson = this.formattingSettings.layoutSettings.calculatedRows.value;
            this.calculatedRows = calcRowsJson ? JSON.parse(calcRowsJson) : [];
        } catch (e) {
            this.calculatedRows = [];
        }

        // Parse Calculated Columns
        try {
            const calcColsJson = this.formattingSettings.layoutSettings.calculatedColumns.value;
            this.calculatedColumns = calcColsJson ? JSON.parse(calcColsJson) : [];
        } catch (e) {
            this.calculatedColumns = [];
        }

        // Parse Inverted Rows
        try {
            const invert = this.formattingSettings.layoutSettings.invertVarianceColors.value;
            const invRowsJson = this.formattingSettings.layoutSettings.invertedRows.value;
            const invList = invRowsJson ? JSON.parse(invRowsJson) : [];
            this.invertedRows = new Set(invList);
        } catch (e) {
            this.invertedRows = new Set();
        }



        // Handle Grand Total Toggle (Filter out data-driven total if disabled)
        const layout = this.formattingSettings.layoutSettings;
        const showTotal = layout && layout.showGrandTotal && layout.showGrandTotal.value;

        // Global Invert
        const invertAll = layout && layout.invertAllValues && layout.invertAllValues.value;

        if (invertAll) {
            const invertRecursive = (nodes: PnLRow[]) => {
                nodes.forEach(n => {
                    // Invert values
                    if (n.actualCY != null) n.actualCY *= -1;
                    if (n.actualPY != null) n.actualPY *= -1;
                    if (n.budget != null) n.budget *= -1;
                    if (n.forecast != null) n.forecast *= -1;

                    // Recalculate variances
                    const variance = (a?: number, b?: number) => (a != null && b != null) ? a - b : undefined;
                    const variancePct = (diff?: number, base?: number) => (base) ? diff! / Math.abs(base) : undefined;

                    n.varCYPY = variance(n.actualCY, n.actualPY);
                    n.varCYPYPct = variancePct(n.varCYPY, n.actualPY);
                    n.varCYBud = variance(n.actualCY, n.budget);
                    n.varCYBudPct = variancePct(n.varCYBud, n.budget);

                    if (n.children) invertRecursive(n.children);
                });
            };
            invertRecursive(this.currentRows);
        }

        // Filter out "Total" rows if setting is off. 
        // Assumption: The data row is labeled "Total" or "Grand Total". Adjust string match as needed.
        // Handle Grand Total logic
        if (showTotal) {
            // Ensure no duplicates if data already has it (simple filter)
            this.currentRows = this.currentRows.filter(r => r.label.toLowerCase() !== "total" && r.label.toLowerCase() !== "grand total");

            const totalRow: PnLRow = {
                label: this.formattingSettings.layoutSettings.grandTotalLabel.value || "Grand Total",
                id: "grand_total",
                level: 0,
                isSubtotal: true,
                children: [],
                actualCY: this.currentRows.reduce((a, b) => a + (b.actualCY || 0), 0),
                actualPY: this.currentRows.reduce((a, b) => a + (b.actualPY || 0), 0),
                budget: this.currentRows.reduce((a, b) => a + (b.budget || 0), 0),
                forecast: this.currentRows.reduce((a, b) => a + (b.forecast || 0), 0)
            };

            // Calc variances for total
            const variance = (a?: number, b?: number) => (a != null && b != null) ? a - b : undefined;
            const variancePct = (d?: number, b?: number) => (b) ? d! / Math.abs(b) : undefined;

            totalRow.varCYPY = variance(totalRow.actualCY, totalRow.actualPY);
            totalRow.varCYPYPct = variancePct(totalRow.varCYPY, totalRow.actualPY);
            totalRow.varCYBud = variance(totalRow.actualCY, totalRow.budget);
            totalRow.varCYBudPct = variancePct(totalRow.varCYBud, totalRow.budget);
            totalRow.varCYFcst = variance(totalRow.actualCY, totalRow.forecast);
            totalRow.varCYFcstPct = variancePct(totalRow.varCYFcst, totalRow.forecast);


            // Add Grand Total at top or bottom based on setting
            const position = this.formattingSettings.layoutSettings.grandTotalPosition.value.value;
            if (position === "top") {
                this.currentRows.unshift(totalRow);
            } else {
                this.currentRows.push(totalRow);
            }
        } else {
            this.currentRows = this.currentRows.filter(r => r.label.toLowerCase() !== "total" && r.label.toLowerCase() !== "grand total");
        }

        this.injectCalculatedRows(); // Inject user calculations

        // Save grand total position setting and remove it before TopN processing
        const grandTotalPosition = this.formattingSettings.layoutSettings.grandTotalPosition.value.value;
        const grandTotalIndex = this.currentRows.findIndex(r => r.id === "grand_total");
        let grandTotal: PnLRow | undefined;
        if (grandTotalIndex >= 0) {
            grandTotal = this.currentRows[grandTotalIndex];
            this.currentRows.splice(grandTotalIndex, 1); // Remove from array before TopN
        }

        this.currentRows = this.applyTopN(this.currentRows);

        // Re-add Grand Total at the correct position after TopN
        if (grandTotal) {
            if (grandTotalPosition === "top") {
                this.currentRows.unshift(grandTotal);
            } else {
                this.currentRows.push(grandTotal);
            }
        }

        // Calculate column maxs for databars
        this.calculateColumnTotals([...this.currentRows, this.grandTotalRow].filter(r => r));

        // Initialize collapsed state
        const disableExpand = this.formattingSettings.layoutSettings.disableExpandCollapse.value;

        if (disableExpand) {
            this.collapsedRows.clear();
        } else if (this.collapsedRows.size === 0) {
            // First load: Collapse all by default
            const collapseAllWithChildren = (rows: PnLRow[]) => {
                rows.forEach(row => {
                    if (row.children && row.children.length > 0) {
                        this.collapsedRows.add(row.id);
                        collapseAllWithChildren(row.children);
                    }
                });
            };
            collapseAllWithChildren(this.currentRows);
        }

        this.render();
        this.events.renderingFinished(options);
    }

    private parseRows(matrix: powerbi.DataViewMatrix): PnLRow[] {
        const rows: PnLRow[] = [];
        const root = matrix.rows.root;

        // Helpers
        const variance = (a?: number | null, b?: number | null) => (a != null && b != null) ? a - b : undefined;
        const variancePct = (diff?: number | null, base?: number | null) => {
            if (diff == null || base == null || base === 0) return undefined;
            return diff / Math.abs(base);
        };

        // 1. Build Column Map
        // We need to know which index in row.values corresponds to which (Group, Measure)
        const colMap: Record<number, { group: string, measure: string }> = {};
        let leafIndex = 0;
        const valueSources = matrix.valueSources;

        const getMeasureRole = (sourceIndex: number): string => {
            const source = valueSources[sourceIndex];
            if (source.roles && source.roles["actualCY"]) return "actualCY";
            if (source.roles && source.roles["actualPY"]) return "actualPY";
            if (source.roles && source.roles["budget"]) return "budget";
            if (source.roles && source.roles["forecast"]) return "forecast";
            return "unknown";
        };

        const mapCols = (node: powerbi.DataViewMatrixNode, currentGroup: string) => {
            // Calculate effective group name for this node (if it's a group level)
            // If currentGroup is set, we are deeper. If not, this node is the group.
            // But mapCols is called on ROOT first with "".
            // Root has children (Groups).
            // So we iterate children.

            if (node.children && node.children.length > 0) {
                node.children.forEach(child => {
                    let nextGroup = currentGroup;
                    if (!nextGroup) {
                        if (child.isSubtotal) {
                            nextGroup = "__ignored__";
                        } else {
                            const val = child.value;
                            nextGroup = (val == null || val === "") ? "(Blank)" : String(val);
                        }
                    } else if (child.isSubtotal || nextGroup === "__ignored__") {
                        nextGroup = "__ignored__";
                    }

                    mapCols(child, nextGroup);
                });
            } else {
                // Leaf Node
                const measureIndex = leafIndex % valueSources.length;
                const measure = getMeasureRole(measureIndex);

                if (currentGroup !== "__ignored__") {
                    colMap[leafIndex] = { group: currentGroup, measure };
                }
                leafIndex++;
            }
        };

        if (matrix.columns && matrix.columns.root) {
            mapCols(matrix.columns.root, "");
        }

        // 2. Traversal
        const traverse = (node: powerbi.DataViewMatrixNode, level: number, parentId: string): PnLRow => {
            const label = String(node.value ?? "Total");
            const id = parentId ? `${parentId}.${label}` : label;

            // Generate Selection ID
            const selectionId = this.host.createSelectionIdBuilder()
                .withMatrixNode(node, matrix.rows.levels)
                .createSelectionId();

            const vals = node.values || {};

            // Extract Values per Group
            const groupedValues: Record<string, Record<string, number>> = {};

            // Initialize totals
            let totalAC = 0, totalPY = 0, totalBud = 0, totalFcst = 0;
            let hasAC = false, hasPY = false, hasBud = false, hasFcst = false;

            Object.keys(colMap).forEach(idxStr => {
                const idx = Number(idxStr);
                const mapping = colMap[idx];
                if (!mapping) return;

                const val = vals[idx]?.value != null ? vals[idx].value as number : undefined;
                if (val !== undefined) {
                    if (!groupedValues[mapping.group]) groupedValues[mapping.group] = {};
                    groupedValues[mapping.group][mapping.measure] = val;
                }
            });

            // Calculate Group Variances & Totals
            // Iterate all identified groups (including "" for flat)
            const groups = Object.keys(groupedValues);
            groups.forEach(g => {
                const gv = groupedValues[g];
                const ac = gv["actualCY"];
                const py = gv["actualPY"];
                const bud = gv["budget"];
                const fcst = gv["forecast"];

                // Invert if needed (Leaf Level Inversion)
                if (this.invertedRows.has(id)) {
                    if (ac != null) gv["actualCY"] = ac * -1;
                    if (py != null) gv["actualPY"] = py * -1;
                    if (bud != null) gv["budget"] = bud * -1;
                    if (fcst != null) gv["forecast"] = fcst * -1;
                }

                // Calculate Variances
                gv["varCYPY"] = variance(gv["actualCY"], gv["actualPY"]);
                gv["varCYPYPct"] = variancePct(gv["varCYPY"], gv["actualPY"]);
                gv["varCYBud"] = variance(gv["actualCY"], gv["budget"]);
                gv["varCYBudPct"] = variancePct(gv["varCYBud"], gv["budget"]);
                gv["varCYFcst"] = variance(gv["actualCY"], gv["forecast"]);
                gv["varCYFcstPct"] = variancePct(gv["varCYFcst"], gv["forecast"]);

                // Accumulate to Total
                // Only if not a group (or if flat)
                // Actually, PnLRow properties (actualCY, etc) are meant to be the ROW TOTAL.
                // Note: If matrix has a "Total" column, it comes as a separate node in columns?
                // Power BI Matrix sends Total as a node.
                // But generally simpler to sum up here if we want row total.
                if (gv["actualCY"] != null) { totalAC += gv["actualCY"]; hasAC = true; }
                if (gv["actualPY"] != null) { totalPY += gv["actualPY"]; hasPY = true; }
                if (gv["budget"] != null) { totalBud += gv["budget"]; hasBud = true; }
                if (gv["forecast"] != null) { totalFcst += gv["forecast"]; hasFcst = true; }
            });

            const children = node.children ? node.children.map(c => traverse(c, level + 1, id)) : [];

            // Auto-aggregate if missing (Subtotal logic)
            // If we have children, we generally want to sum them up to get the Group values for THIS row.
            // Unless the data view already provides subtotals.
            // Power BI usually provides subtotals in `values` for the parent node.
            // But if `values` is empty/undefined, we act as custom aggregator.

            if (children.length > 0) {
                // Aggregation for Groups
                // We need to merge child.groupedValues into current row's groupedValues if missing

                // Get all unique groups from children
                const childGroups = new Set<string>();
                children.forEach(c => {
                    if (c.groupedValues) Object.keys(c.groupedValues).forEach(g => childGroups.add(g));
                });

                childGroups.forEach(g => {
                    if (!groupedValues[g]) groupedValues[g] = {};
                    const gv = groupedValues[g];

                    // Helper to sum child property
                    const sum = (m: string) => children.reduce((s, c) => {
                        const val = c.groupedValues && c.groupedValues[g] ? c.groupedValues[g][m] : undefined;
                        return s + (val || 0);
                    }, 0);

                    // Only aggregate if we don't have a value (DataView precedence)
                    if (gv["actualCY"] == null) gv["actualCY"] = sum("actualCY");
                    if (gv["actualPY"] == null) gv["actualPY"] = sum("actualPY");
                    if (gv["budget"] == null) gv["budget"] = sum("budget");
                    if (gv["forecast"] == null) gv["forecast"] = sum("forecast");

                    // Invert aggregated result if needed
                    if (this.invertedRows.has(id)) {
                        if (gv["actualCY"] != null) gv["actualCY"] *= -1;
                        if (gv["actualPY"] != null) gv["actualPY"] *= -1;
                        if (gv["budget"] != null) gv["budget"] *= -1;
                        if (gv["forecast"] != null) gv["forecast"] *= -1;
                    }

                    // Calc Variances for the aggregated group
                    gv["varCYPY"] = variance(gv["actualCY"], gv["actualPY"]);
                    gv["varCYPYPct"] = variancePct(gv["varCYPY"], gv["actualPY"]);
                    gv["varCYBud"] = variance(gv["actualCY"], gv["budget"]);
                    gv["varCYBudPct"] = variancePct(gv["varCYBud"], gv["budget"]);
                    gv["varCYFcst"] = variance(gv["actualCY"], gv["forecast"]);
                    gv["varCYFcstPct"] = variancePct(gv["varCYFcst"], gv["forecast"]);
                });

                // Re-sum totals from groups
                totalAC = 0; totalPY = 0; totalBud = 0; totalFcst = 0;
                Object.values(groupedValues).forEach(gv => {
                    totalAC += (gv["actualCY"] || 0);
                    totalPY += (gv["actualPY"] || 0);
                    totalBud += (gv["budget"] || 0);
                    totalFcst += (gv["forecast"] || 0);
                });
            }

            return {
                label: label,
                id: id,
                level: level,
                isSubtotal: node.isSubtotal || false,
                actualCY: totalAC, // Store totals for sorting/TopN
                actualPY: totalPY,
                budget: totalBud,
                forecast: totalFcst,
                // Variances of the Totals
                varCYPY: variance(totalAC, totalPY),
                varCYPYPct: variancePct(variance(totalAC, totalPY), totalPY),
                varCYBud: variance(totalAC, totalBud),
                varCYBudPct: variancePct(variance(totalAC, totalBud), totalBud),
                varCYFcst: variance(totalAC, totalFcst),
                varCYFcstPct: variancePct(variance(totalAC, totalFcst), totalFcst),
                children: children,
                selectionId: selectionId,
                groupedValues: groupedValues
            };
        };

        return root.children ? root.children.map(c => traverse(c, 0, "")) : [];
    }

    private parseTotal(matrix: powerbi.DataViewMatrix): PnLRow | undefined {
        return undefined; // Deprecated
    }

    private applyTopN(rows: PnLRow[]): PnLRow[] {
        const settings = this.formattingSettings.topNSettings;
        if (!settings || !settings.enabled || !settings.enabled.value) return rows;

        const n = settings.topN && settings.topN.value ? settings.topN.value : 5;
        const sortBy = settings.sortBy && settings.sortBy.value && settings.sortBy.value.value ? settings.sortBy.value.value as string : "actualCY";
        const otherLabel = settings.otherLabel && settings.otherLabel.value ? settings.otherLabel.value : "Others";

        const getSortValue = (row: PnLRow): number => {
            let val = 0;
            if (sortBy === "actualCY") val = row.actualCY ?? 0;
            else if (sortBy === "budget") val = row.budget ?? 0;
            else if (sortBy === "varCYPY") val = Math.abs(row.varCYPY ?? 0);
            else if (sortBy === "varCYBud") val = Math.abs(row.varCYBud ?? 0);
            return val;
        };

        // Recursive Top N? Or just top level? Usually Top N is contextual. 
        // Let's apply it recursively to all lists of children.

        const processLevel = (nodes: PnLRow[]): PnLRow[] => {
            if (nodes.length <= n) return nodes.map(node => ({ ...node, children: processLevel(node.children) }));

            // Sort descending
            const sorted = [...nodes].sort((a, b) => getSortValue(b) - getSortValue(a));

            const top = sorted.slice(0, n);
            const others = sorted.slice(n);

            if (others.length > 0) {
                const otherRow: PnLRow = {
                    label: otherLabel,
                    id: nodes[0].id + "_others", // Synthesize ID
                    level: nodes[0].level, // Same level as peers
                    isSubtotal: true, // Style as subtotal/distinct
                    children: [], // Flattened "Other" usually doesn't show children unless expanded, but for simplicity we aggregate values.
                    actualCY: others.reduce((s, r) => s + (r.actualCY || 0), 0),
                    actualPY: others.reduce((s, r) => s + (r.actualPY || 0), 0),
                    budget: others.reduce((s, r) => s + (r.budget || 0), 0),
                    forecast: others.reduce((s, r) => s + (r.forecast || 0), 0),
                };

                // Recalculate variances for Other
                // Re-use variance logic from render/parse scope? Or duplicate tiny helpers?
                const variance = (a: number, b: number) => a - b;
                const variancePct = (diff: number, base: number) => base !== 0 ? diff / Math.abs(base) : 0;

                otherRow.varCYPY = variance(otherRow.actualCY!, otherRow.actualPY!);
                otherRow.varCYPYPct = variancePct(otherRow.varCYPY, otherRow.actualPY!);
                otherRow.varCYBud = variance(otherRow.actualCY!, otherRow.budget!);
                otherRow.varCYBudPct = variancePct(otherRow.varCYBud, otherRow.budget!);
                otherRow.varCYFcst = variance(otherRow.actualCY!, otherRow.forecast!);
                otherRow.varCYFcstPct = variancePct(otherRow.varCYFcst, otherRow.forecast!);


                top.push(otherRow);
            }

            // Recurse for children of the top nodes
            return top.map(node => ({
                ...node,
                children: processLevel(node.children)
            }));
        };

        return processLevel(rows);
    }

    private injectCalculatedRows() {
        if (!this.calculatedRows || this.calculatedRows.length === 0) return;

        // Helper to flatten hierarchy
        const getAllRows = (nodes: PnLRow[]): PnLRow[] => {
            let list: PnLRow[] = [];
            nodes.forEach(n => {
                list.push(n);
                if (n.children && n.children.length > 0) {
                    list = list.concat(getAllRows(n.children));
                }
            });
            return list;
        };

        // Map all rows for easy access
        // Map all rows for easy access
        const rowMap = new Map<string, PnLRow>();
        getAllRows(this.currentRows).forEach(r => rowMap.set(r.label.trim().toLowerCase(), r));

        this.calculatedRows.forEach(config => {
            if (config.isBlank) {
                const newRow: PnLRow = {
                    label: "", // Empty label as requested
                    id: config.id,
                    level: 0,
                    isSubtotal: false,
                    children: [],
                    isBlank: true
                };
                this.currentRows.push(newRow);
                this.currentRows.push(newRow);
                rowMap.set(newRow.label.trim().toLowerCase(), newRow);
                return;
            }

            // Helper to get value
            // Helper to get value
            const getValue = (label: string, field: keyof PnLRow): number => {
                // Normalize: Trim and Lowercase. 
                // Note: We do NOT remove quotes here as the label from formula (via sortedNames) should be clean.
                // If the formula was " 'Revenue' ", the parsing might need care, but current logic iterates known names.
                const key = label.trim().toLowerCase();
                const r = rowMap.get(key);
                return r && r[field] ? r[field] as number : 0;
            };

            // Strategy: Use placeholders to avoid replacing parts of numbers or previously substituted values
            // Filter out empty row names to avoid matching empty strings
            const sortedNames = Array.from(rowMap.keys()).filter(n => n.length > 0).sort((a, b) => b.length - a.length);

            const compute = (field: keyof PnLRow): number | undefined => {
                // Strip quotes from formula FIRST before any matching
                let expression = config.formula.replace(/['"]/g, "");
                const replacements: { placeholder: string, value: number }[] = [];

                console.log(`[CalcRow DEBUG] Formula: "${config.formula}", Field: ${field}`);
                console.log(`[CalcRow DEBUG] Stripped formula: "${expression}"`);
                console.log(`[CalcRow DEBUG] Available rows:`, sortedNames.slice(0, 10)); // Show first 10 only

                // 1. Replace all names with unique placeholders
                for (let i = 0; i < sortedNames.length; i++) {
                    const name = sortedNames[i];

                    const esc = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    // Use word boundaries if possible, but names can contain spaces.
                    // We'll rely on length sorting and placeholders.
                    const re = new RegExp(esc, "gi");

                    // Use match() to check without advancing pointer, then replace
                    if (expression.match(re)) {
                        const placeholder = `__VAR_${i}__`;
                        const val = getValue(name, field);
                        console.log(`[CalcRow DEBUG] Matched "${name}" -> value: ${val}`);
                        replacements.push({ placeholder, value: val });
                        // Create fresh regex for replace to avoid stateful issues
                        expression = expression.replace(new RegExp(esc, "gi"), placeholder);
                    }
                }

                // 2. Replace placeholders with values
                replacements.forEach(rep => {
                    expression = expression.split(rep.placeholder).join(String(rep.value));
                });

                console.log(`[CalcRow DEBUG] Final expression: "${expression}"`);

                // Safety check: only allow basic math chars
                if (!/^[\d\.\+\-\*\/\(\)\s]+$/.test(expression)) {
                    console.log(`[CalcRow DEBUG] FAILED safety check - expression contains invalid chars`);
                    return undefined;
                }

                try {
                    const result = this.evaluateArithmeticExpression(expression);
                    const val = result == null || isNaN(result) || !isFinite(result) ? undefined : result;

                    if (val != null && config.format && config.format.invertSign) {
                        return val * -1;
                    }
                    return val;
                } catch (e) {
                    return undefined;
                }
            };

            const actualCY = compute("actualCY");
            const actualPY = compute("actualPY");
            const budget = compute("budget");
            const forecast = compute("forecast");

            const variance = (a?: number, b?: number) => (a != null && b != null) ? a - b : undefined;
            const variancePct = (diff?: number, base?: number) => (base) ? diff! / Math.abs(base) : undefined;

            const varCYPY = variance(actualCY, actualPY);
            const varCYBud = variance(actualCY, budget);
            const varCYFcst = variance(actualCY, forecast);

            const newRow: PnLRow = {
                label: config.name,
                id: config.id,
                level: 0,
                isSubtotal: true,
                actualCY,
                actualPY,
                budget,
                varCYPY,
                varCYPYPct: variancePct(varCYPY, actualPY),
                varCYBud,
                varCYBudPct: variancePct(varCYBud, budget),
                varCYFcst,
                varCYFcstPct: variancePct(varCYFcst, forecast),
                children: [],
                format: config.format, // Pass formatting
                skip: config.skip,
                result: config.result
            };

            // Add to current Rows
            this.currentRows.push(newRow);
            // Also add to map so subsequent calculations can use it?
            rowMap.set(newRow.label.toLowerCase(), newRow);
        });

        // After injecting all calculated rows, re-sort currentRows if a manual order exists
        if (this.rowOrder["root"] && this.rowOrder["root"].length > 0) {
            const orderMap = new Map<string, number>();
            this.rowOrder["root"].forEach((id, index) => orderMap.set(id, index));

            // Create a lookup for calculated row original index to stabilize sort for unknown rows
            const calcRowIndexMap = new Map<string, number>();
            this.calculatedRows.forEach((r, i) => calcRowIndexMap.set(r.id, i));

            this.currentRows.sort((a, b) => {
                const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : -1;
                const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : -1;

                // If both are known, Use Order Map
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;

                // Known rows come before Unknown rows
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;

                // Both Unknown:
                // If both are Calculated Rows, sort by their config index to keep them together
                const cA = calcRowIndexMap.has(a.id);
                const cB = calcRowIndexMap.has(b.id);

                if (cA && cB) {
                    return calcRowIndexMap.get(a.id)! - calcRowIndexMap.get(b.id)!;
                }

                // Stable sort for others
                return 0;
            });
        }
    }

    private applyRowOrder(rows: PnLRow[], parentId: string = "root"): PnLRow[] {
        const order = this.rowOrder[parentId];
        if (!order) return rows.map(r => ({
            ...r,
            children: this.applyRowOrder(r.children, r.id)
        }));

        let sorted = [];
        const remaining = new Map(rows.map(r => [r.id, r]));

        order.forEach(id => {
            if (remaining.has(id)) {
                sorted.push(remaining.get(id)!);
                remaining.delete(id);
            }
        });

        // Append any new/remaining rows (e.g. calculated rows not yet in order, or new data rows)
        if (remaining.size > 0) {
            sorted = [...sorted, ...Array.from(remaining.values())];
        }

        return sorted.map(r => ({
            ...r,
            children: this.applyRowOrder(r.children, r.id)
        }));
    }

    private sortRows(rows: PnLRow[]): PnLRow[] {
        // If Manual Sort is active, we skip column sorting
        if (this.isManualSort) {
            return this.applyRowOrder(rows);
        }

        if (!this.sortColumn || this.sortDirection === "none") {
            // Apply Manual Sort Order / Default Data Order if no sort column
            return this.applyRowOrder(rows);
        }

        const col = this.sortColumn;
        const dir = this.sortDirection === "asc" ? 1 : -1;

        const compare = (a: PnLRow, b: PnLRow): number => {
            const aVal = a[col];
            const bVal = b[col];

            if (aVal == null && bVal == null) return 0;
            if (aVal == null) return 1;
            if (bVal == null) return -1;

            if (typeof aVal === "string" && typeof bVal === "string") {
                return aVal.localeCompare(bVal) * dir;
            }
            return ((aVal as number) - (bVal as number)) * dir;
        };

        // Sort top-level rows, then recursively sort children
        const sortRecursive = (arr: PnLRow[]): PnLRow[] => {
            const sorted = [...arr].sort(compare);
            return sorted.map(row => ({
                ...row,
                children: row.children.length > 0 ? sortRecursive(row.children) : []
            }));
        };

        return sortRecursive(rows);
    }



    private getColorStyle(val?: number | null): string {
        const layout = this.formattingSettings.layoutSettings;
        const invert = layout && layout.invertVarianceColors && layout.invertVarianceColors.value;
        const posColor = layout && layout.positiveColor && layout.positiveColor.value ? layout.positiveColor.value.value : "#107C10";
        const negColor = layout && layout.negativeColor && layout.negativeColor.value ? layout.negativeColor.value.value : "#D13438";

        const realPos = invert ? negColor : posColor;
        const realNeg = invert ? posColor : negColor;

        if (val == null) return "";
        return val >= 0 ? `color:${realPos};` : `color:${realNeg};`;
    }

    private calculateColumnTotals(rows: PnLRow[]) {
        const keys: (keyof PnLRow)[] = ["actualCY", "actualPY", "budget", "forecast", "varCYPY", "varCYBud", "varCYFcst"];
        this.columnTotals = {};

        const process = (r: PnLRow) => {
            // Skip rows marked as 'skip' from max/min calculation
            if (r.skip) {
                if (r.children) r.children.forEach(process);
                return;
            }

            keys.forEach(k => {
                if (typeof r[k] === 'number') {
                    const v = Math.abs(r[k] as number);
                    this.columnTotals[k as string] = Math.max(this.columnTotals[k as string] || 0, v);
                }
            });
            if (r.children) r.children.forEach(process);
        };
        rows.forEach(process);
    }


    private renderCell(row: PnLRow, key: string, val: number | undefined, fmt: (v: number) => string): string {
        if (row.isBlank) return "&nbsp;";
        if (val == null) return "-";
        const config = this.columnFormatting[key] || {};

        // Text Wrap logic (default to off/nowrap)
        const numWrap = this.formattingSettings.numberFormatting.textWrap.value;
        const wrapStyle = numWrap ? "" : "white-space:nowrap;";

        // Get sentiment colors
        const layout = this.formattingSettings.layoutSettings;
        const invert = layout && layout.invertVarianceColors && layout.invertVarianceColors.value;
        const posColor = layout && layout.positiveColor && layout.positiveColor.value ? layout.positiveColor.value.value : "#107C10";
        const negColor = layout && layout.negativeColor && layout.negativeColor.value ? layout.negativeColor.value.value : "#D13438";

        const realPos = invert ? negColor : posColor;
        const realNeg = invert ? posColor : negColor;

        const sentimentColor = val >= 0 ? realPos : realNeg;

        // Base Style
        let style = "";

        // Font Type
        if (config.type === "font") {
            style += `color:${sentimentColor};`;
        } else if (config.fontColor) {
            style += `color:${config.fontColor};`;
        } else if (config.type === undefined && key.endsWith("Pct")) {
            // Default sentiment coloring for percentage columns only when NO format is set (not even "text")
            style += `color:${sentimentColor};`;
        }

        let inner = fmt(val);

        if (config.type === "waterfall") {
            // REMOVED DUPLICATE BLOCK
        }
        // Actually, I'll just remove it entirely.


        // Background Type
        if (config.type === "background") {
            style += `background-color:${sentimentColor};color:#fff;`; // White text for contrast
        } else if (config.backgroundColor) {
            style += `background-color:${config.backgroundColor};`;
        }

        // Waterfall Icon
        // Originally logic was implicit. Now let's handle "waterfall" type specifically for icon injection? 
        // The original logic didn't inject an icon in renderCell, it just set style? 
        // Wait, renderCell in step 1204 has: 
        // if (config.type === "waterfall" || config.showSentiment) { color... }
        // BUT WHERE IS THE ARROW? 
        // Ah, 'renderCell' returns inner HTML. 
        // If it was waterfall, does it append an arrow? 
        // Checking lines 911-944 in Step 1204... I DON'T SEE ARROW LOGIC.
        // Was it handled in `render` map? 
        // Line 963-971 calls renderCell.
        // Maybe I missed the arrow logic in renderCell? 
        // Or maybe Waterfall in this visual just meant *coloring*?
        // Let's re-read rendering logic.
        // Step 1204: 
        // 927: let inner = fmt(val);
        // ... databar logic ...
        // Returns inner.
        // I DON'T SEE WATERFALL ARROW LOGIC.
        // Maybe "Waterfall" option was just coloring all along?
        // If so, then "Font" and "Waterfall" are identical?

        // If "Waterfall" is just coloring, then "Font" is the better name.
        // But if I selected "Waterfall" before, I got red/green numbers.
        // If I select "Font" now, I get red/green numbers.
        // User wants "Background".

        // Okay, if existing "Waterfall" was just text color, then I should keep it for backward compat or just treat it as Font.
        // But wait, user asked "Add Font as a Format Type". "Add Background as a Format Type". 
        // "Remove the current 'Background' option". 
        // And "For other formatting types it should not change the color of the font."

        // Sentiment Text Color Logic
        // Legacy "waterfall" used to mean text color.
        // NOW "waterfall" means "Sentiment Arrows" (icon only).
        // So we only apply text color if showSentiment is true AND type is NOT "waterfall".
        // Also handling lint error by casting to string if needed, or just relying on JS runtime behavior but TS might complain.
        // To be safe: (config.type as string) !== "waterfall"

        // style is already defined above.

        // Apply Background Color
        if (config.backgroundColor) {
            style += `background-color:${config.backgroundColor};`;
        }

        // Apply Font Color (Explicit)
        if (config.fontColor) {
            style += `color:${config.fontColor};`;
        }

        // Apply Sentiment Text Color (if not overridden by explicit font color? OR always?)
        // Usually explicit wins.
        // Logic: if showSentiment is on, we color the text. UNLESS it's "waterfall" (Arrows) or "databar" (bars might handle it specially, but usually databar doesn't color text unless mixed).
        // Actually, user said: "For other formatting types it should not change the color of the font."
        // So ONLY apply text color if type is "font" (implicit?) or just "showSentiment" is checked on a type that SUPPORTS text coloring.
        // Which types support text coloring? "font" and "background" (maybe?).
        // "databar", "lollipop", "waterfall" (arrows) do NOT want text coloring.

        if (!config.fontColor && config.showSentiment && (config.type as string) !== "waterfall" && config.type !== "databar" && config.type !== "lollipop" && config.type !== "bullet") {
            const color = this.getColorStyle(val);
            // getColorStyle returns 'color:x;' string.
            // We need to extract just color or use it. 
            // Wait, getColorStyle returns "color: #...;"
            style += this.getColorStyle(val);
        }

        // Databar Logic
        if (config.type === "databar") {
            const max = this.columnTotals[key] || 0;
            // Diverging Bar: 50% is center. Max magnitude scales to 50% width.
            const pct = max !== 0 ? (Math.abs(val) / max) * 50 : 0;
            const barColor = config.databarColor || "#e6e6e6"; // Default gray

            const finalBarColor = config.showSentiment ? (val >= 0 ? (invert ? "#ffe6e6" : "#e6ffe6") : (invert ? "#e6ffe6" : "#ffe6e6")) : barColor;

            const left = val >= 0 ? 50 : 50 - pct;

            inner = `<div style="position:relative;width:100%;height:100%;">
                <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:#ccc;z-index:0;"></div>
                <div style="position:absolute;top:2px;bottom:2px;left:${left}%;width:${pct}%;background:${finalBarColor};z-index:0;"></div>
                <span style="position:relative;z-index:1;">${inner}</span>
            </div>`;
        } else if (config.type === "lollipop") {
            const max = this.columnTotals[key] || 0;
            const pct = max !== 0 ? (Math.abs(val) / max) * 50 : 0;
            const barColor = config.databarColor || "#888";
            const finalBarColor = config.showSentiment ? (val >= 0 ? realPos : realNeg) : barColor;

            const stickLeft = val >= 0 ? 50 : 50 - pct;
            const stickWidth = pct;
            const dotLeft = val >= 0 ? (50 + pct) : (50 - pct);

            // Stick
            const stickHeight = "2px";
            const stickTop = "calc(50% - 1px)";
            // Dot
            const dotSize = "8px";
            const dotTop = "calc(50% - 4px)";

            inner = `<div style="position:relative;width:100%;height:100%;">
                <div style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:#ccc;z-index:0;"></div>
                <div style="position:absolute;top:${stickTop};left:${stickLeft}%;width:${stickWidth}%;height:${stickHeight};background:${finalBarColor};z-index:0;"></div>
                <div style="position:absolute;top:${dotTop};left:${dotLeft}%;width:${dotSize};height:${dotSize};background:${finalBarColor};border-radius:50%;transform:translateX(-50%);z-index:0;"></div>
                <span style="position:relative;z-index:1;">${inner}</span>
            </div>`;

        } else if ((config.type as string) === "waterfall") {
            // Sentiment Arrows
            // Render colored arrow LEFT of the text.
            const color = val >= 0 ? realPos : realNeg;
            const arrow = val >= 0 ? "▲" : "▼";

            // We want arrow colored, but text uncolored (unless global text color is set elsewhere, but here inside 'inner' we won't force it).
            // Actually 'inner' currently holds the formatted text.

            inner = `<span style="color:${color};margin-right:4px;">${arrow}</span>${inner}`;
        }


        // Logic for Waterfall Arrow? 
        // Maybe it was intended to have an arrow but didn't? 
        // I won't add an arrow if it wasn't there. I'll just strictly follow "Add Font", "Add Background".

        return `<div style="${style}${wrapStyle}width:100%;height:100%;">${inner}</div>`;
    }

    private render() {
        // Remove Grand Total before sorting to preserve its position
        const grandTotalPosition = this.formattingSettings.layoutSettings.grandTotalPosition.value.value;
        const grandTotalIndex = this.currentRows.findIndex(r => r.id === "grand_total");
        let grandTotal: PnLRow | undefined;
        let rowsToSort = this.currentRows;

        if (grandTotalIndex >= 0) {
            grandTotal = this.currentRows[grandTotalIndex];
            rowsToSort = [...this.currentRows];
            rowsToSort.splice(grandTotalIndex, 1);
        }

        let rows = this.sortRows(rowsToSort);

        // Re-add Grand Total at correct position after sorting
        if (grandTotal) {
            if (grandTotalPosition === "top") {
                rows = [grandTotal, ...rows];
            } else {
                rows = [...rows, grandTotal];
            }
        }


        // --- Number Formatting Setup ---
        const numSettings = this.formattingSettings.numberFormatting;
        const displayUnits = numSettings && numSettings.displayUnits ? numSettings.displayUnits.value : 0;
        let divisor = 1;
        let suffix = "";

        if (displayUnits === 0) { // Auto
            let maxVal = 0;
            const check = (r: PnLRow) => {
                const keys: (keyof PnLRow)[] = ["actualCY", "actualPY", "budget"];
                keys.forEach(k => { if (typeof r[k] === 'number') maxVal = Math.max(maxVal, Math.abs(r[k] as number)); });
                if (r.children) r.children.forEach(check);
            };
            this.currentRows.forEach(check);

            if (maxVal >= 1000000000) { divisor = 1000000000; suffix = numSettings.suffixBillions.value || "B"; }
            else if (maxVal >= 1000000) { divisor = 1000000; suffix = numSettings.suffixMillions.value || "M"; }
            else if (maxVal >= 1000) { divisor = 1000; suffix = numSettings.suffixThousands.value || "k"; }
        } else if ((displayUnits as number) > 1) {
            divisor = displayUnits as number;
            if (divisor === 1000) suffix = numSettings.suffixThousands.value || "k";
            if (divisor === 1000000) suffix = numSettings.suffixMillions.value || "M";
            if (divisor === 1000000000) suffix = numSettings.suffixBillions.value || "B";
        }

        const decimals = numSettings && numSettings.decimalPlaces ? numSettings.decimalPlaces.value : 0;
        const useSeparator = numSettings && numSettings.useThousandSeparator ? numSettings.useThousandSeparator.value : true;
        const separatorChar = numSettings && numSettings.thousandSeparatorChar ? numSettings.thousandSeparatorChar.value : ",";
        const negFormat = numSettings && numSettings.negativeFormat && numSettings.negativeFormat.value ? numSettings.negativeFormat.value.value : "minus";
        const valPrefix = numSettings && numSettings.valuePrefix ? numSettings.valuePrefix.value : "";
        const valSuffix = numSettings && numSettings.valueSuffix ? numSettings.valueSuffix.value : "";

        const pctDecimals = numSettings && numSettings.percentDecimalPlaces ? numSettings.percentDecimalPlaces.value : 1;
        const showPctSign = numSettings && numSettings.showPercentSign ? numSettings.showPercentSign.value : true;
        const pctPointAbbr = numSettings && numSettings.percentagePointAbbr ? numSettings.percentagePointAbbr.value : "";

        const fmt = (v?: number | null) => {
            if (v == null) return "-";
            const val = v / divisor;
            let formatted = Math.abs(val).toFixed(decimals);

            if (useSeparator) {
                const parts = formatted.split(".");
                parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separatorChar || ",");
                formatted = parts.join(".");
            }

            formatted += suffix;
            const fullFormatted = `${valPrefix}${formatted}${valSuffix}`;

            if (val < 0) {
                return negFormat === "parentheses" ? `(${fullFormatted})` : `-${fullFormatted}`;
            }
            return fullFormatted;
        };

        const fmtPct = (v?: number | null) => {
            if (v != null) {
                const p = (v * 100).toFixed(pctDecimals);
                const s = showPctSign ? "%" : "";
                return `${p}${s}`; // No longer automatically append pctPointAbbr here
            }
            return "-";
        };

        const fmtPctPoint = (v?: number | null) => {
            if (v != null) {
                const p = (v * 100).toFixed(pctDecimals);
                // If suffix is provided (e.g. 'pp'), use it and skip %. Otherwise default to % if enabled.
                const suffix = pctPointAbbr ? pctPointAbbr : (showPctSign ? "%" : "");
                return `${p}${suffix}`;
            }
            return "-";
        };



        // --- Columns Setup ---
        // --- Columns Setup ---
        const colLabels = this.formattingSettings.columnsSettings.columnLabels;

        // Helper to get raw value
        const getVal = (r: PnLRow, measure: string, group?: string) => {
            if (!group) return r[measure]; // Flat structure
            // In grouped structure, we expect r.values[group][measure] or similar?
            // Actually, parseRows likely needs update to flatten the matrix correctly or store it structually.
            // Let's assume parseRows stores a dictionary `values` keyed by group name? 
            // Wait, I need to update parseRows too.
            // For now, let's define the rendering logic assuming `r.groupedValues[group][measure]` exists.
            if (r.groupedValues && r.groupedValues[group]) {
                return r.groupedValues[group][measure];
            }
            return undefined;
        };

        const createRenderers = (inputGroup?: string) => {
            const g = inputGroup;
            return {
                "label": { label: colLabels.headerRow.value, render: (r) => r.label }, // Label is always common
                "actualCY": { label: colLabels.headerActualCY.value, render: (r) => this.renderCell(r, g ? `${g}_actualCY` : "actualCY", getVal(r, "actualCY", g), r.format?.percentage ? fmtPct : fmt) },
                "actualPY": { label: colLabels.headerActualPY.value, render: (r) => this.renderCell(r, g ? `${g}_actualPY` : "actualPY", getVal(r, "actualPY", g), r.format?.percentage ? fmtPct : fmt) },
                "varCYPY": { label: colLabels.headerVarCYPY.value, render: (r) => this.renderCell(r, g ? `${g}_varCYPY` : "varCYPY", getVal(r, "varCYPY", g), r.format?.percentage ? fmtPctPoint : fmt) },
                "varCYPYPct": { label: colLabels.headerVarCYPYPct.value, render: (r) => this.renderCell(r, g ? `${g}_varCYPYPct` : "varCYPYPct", getVal(r, "varCYPYPct", g), fmtPct) },
                "budget": { label: colLabels.headerBudget.value, render: (r) => this.renderCell(r, g ? `${g}_budget` : "budget", getVal(r, "budget", g), r.format?.percentage ? fmtPct : fmt) },
                "forecast": { label: colLabels.headerForecast.value, render: (r) => this.renderCell(r, g ? `${g}_forecast` : "forecast", getVal(r, "forecast", g), r.format?.percentage ? fmtPct : fmt) },
                "varCYBud": { label: colLabels.headerVarCYBud.value, render: (r) => this.renderCell(r, g ? `${g}_varCYBud` : "varCYBud", getVal(r, "varCYBud", g), r.format?.percentage ? fmtPctPoint : fmt) },
                "varCYBudPct": { label: colLabels.headerVarCYBudPct.value, render: (r) => this.renderCell(r, g ? `${g}_varCYBudPct` : "varCYBudPct", getVal(r, "varCYBudPct", g), fmtPct) },
                "varCYFcst": { label: colLabels.headerVarCYFcst.value, render: (r) => this.renderCell(r, g ? `${g}_varCYFcst` : "varCYFcst", getVal(r, "varCYFcst", g), r.format?.percentage ? fmtPctPoint : fmt) },
                "varCYFcstPct": { label: colLabels.headerVarCYFcstPct.value, render: (r) => this.renderCell(r, g ? `${g}_varCYFcstPct` : "varCYFcstPct", getVal(r, "varCYFcstPct", g), fmtPct) }
            };
        };

        let allColumns: Record<string, { label: string, render: (r: PnLRow) => string, group?: string, isMeasure?: boolean }>;

        // Base measures keys
        const standardMeasureKeys = ["actualCY", "actualPY", "varCYPY", "varCYPYPct", "budget", "forecast", "varCYBud", "varCYBudPct", "varCYFcst", "varCYFcstPct"];

        // If grouped
        if (this.columnGroups && this.columnGroups.length > 0) {
            allColumns = {};
            // Add Row Header Code
            allColumns["label"] = { label: colLabels.headerRow.value, render: (r) => r.label, group: null, isMeasure: false };

            this.columnGroups.forEach(group => {
                const renderers = createRenderers(group.name);
                standardMeasureKeys.forEach(mKey => {
                    const compoundKey = `${group.name}_${mKey}`;
                    allColumns[compoundKey] = {
                        label: renderers[mKey].label, // Use standard label for sub-headers
                        render: renderers[mKey].render,
                        group: group.name,
                        isMeasure: true
                    };
                });
            });

        } else {
            // Flat
            const r = createRenderers();
            allColumns = {};
            // Map back to expected format
            Object.keys(r).forEach(k => {
                allColumns[k] = { label: r[k].label, render: r[k].render, group: null, isMeasure: k !== "label" };
            });
        }


        // Inject Calculated Columns
        this.calculatedColumns.forEach(col => {
            allColumns[col.id] = {
                label: col.name,
                render: (r: PnLRow) => {
                    if (r.skip) return "&nbsp;";
                    const val = this.evaluateColumnFormula(col.formula, r);
                    return this.renderCell(r, col.id, val, col.format?.percentage ? fmtPct : fmt);
                }
            };
        });

        const orderSetting = this.formattingSettings.layoutSettings.columnOrder.value || "actualCY, actualPY, varCYPY, varCYPYPct, budget, forecast, varCYBud, varCYBudPct, varCYFcst, varCYFcstPct";
        let rawKeys = orderSetting.split(",").map(s => s.trim());

        // Filter standard keys based on visibility
        const vis = this.formattingSettings.columnsSettings.columnVisibility;
        const visibleStandardKeys = standardMeasureKeys.filter(k => {
            if (!vis) return true;
            const show = (s: any) => s && s.value !== undefined ? s.value : true;
            if (k === "actualCY") return show(vis.showActualCY);
            if (k === "actualPY") return this.hasPY && show(vis.showActualPY);
            if (k === "budget") return this.hasBudget && show(vis.showBudget);
            if (k === "forecast") return this.hasForecast && show(vis.showForecast);
            if (k === "varCYPY") return this.hasPY && show(vis.showVarCYPY);
            if (k === "varCYPYPct") return this.hasPY && show(vis.showVarCYPYPct);
            if (k === "varCYBud") return this.hasBudget && show(vis.showVarCYBud);
            if (k === "varCYBudPct") return this.hasBudget && show(vis.showVarCYBudPct);
            if (k === "varCYFcst") return this.hasForecast && show(vis.showVarCYFcst);
            if (k === "varCYFcstPct") return this.hasForecast && show(vis.showVarCYFcstPct);
            return true;
        });

        // Determine final column keys to render
        let columnKeys: string[] = [];

        if (this.columnGroups && this.columnGroups.length > 0) {
            // Grouped Mode: Iterate groups and add visible measures for each
            this.columnGroups.forEach(g => {
                // Apply sorting or order if needed? For now, standard order within group
                // We could respect `columnOrder` string by applying it to the measure part of the key
                // But simplified: use `visibleStandardKeys` order
                visibleStandardKeys.forEach(mk => {
                    // Check if user manually reordered? 
                    // supporting manual reorder in grouped mode is complex. Default to standard order.
                    columnKeys.push(`${g.name}_${mk}`);
                });
            });
            // Add calculated columns? Usually they are global or per group?
            // If per group, they need a formula context.
            // If global, they go at end?
            // For now, suppress calculated columns in grouped mode or treat as global trailing
        } else {
            // Flat Mode: Use rawKeys (User Order) + Visibility + New Keys
            standardMeasureKeys.forEach(k => { if (!rawKeys.includes(k)) rawKeys.push(k); });
            columnKeys = rawKeys.filter(k => visibleStandardKeys.includes(k));
        }



        // Add calculated columns to the end if not explicitly in order
        this.calculatedColumns.forEach(col => {
            if (!columnKeys.includes(col.id)) {
                columnKeys.push(col.id);
            }
        });

        if (!columnKeys.includes("label")) columnKeys.unshift("label");
        else {
            const idx = columnKeys.indexOf("label");
            if (idx > 0) { columnKeys.splice(idx, 1); columnKeys.unshift("label"); }
        }

        // --- Helper Renderers ---
        const getBorderStyle = (top: boolean, bottom: boolean, left: boolean, right: boolean, color: string, width: number, style: string) => {
            let s = "";
            const b = `${width}px ${style} ${color}`;
            if (top) s += `border-top:${b} !important;`;
            if (bottom) s += `border-bottom:${b} !important;`;
            if (left) s += `border-left:${b} !important;`;
            if (right) s += `border-right:${b} !important;`;
            return s;
        };

        const borders = this.formattingSettings.gridlineSettings.bordersGroup;
        const rowBorder = getBorderStyle(borders.rbTop.value, borders.rbBottom.value, borders.rbLeft.value, borders.rbRight.value, borders.rbColor.value.value, borders.rbWidth.value, borders.rbStyle.value.value as string);
        const colBorder = getBorderStyle(borders.cbTop.value, borders.cbBottom.value, borders.cbLeft.value, borders.cbRight.value, borders.cbColor.value.value, borders.cbWidth.value, borders.cbStyle.value.value as string);
        const valBorder = getBorderStyle(borders.vbTop.value, borders.vbBottom.value, borders.vbLeft.value, borders.vbRight.value, borders.vbColor.value.value, borders.vbWidth.value, borders.vbStyle.value.value as string);

        const gridLines = this.formattingSettings.gridlineSettings.gridLinesGroup;
        const showH = gridLines.showHorizontal.value;
        const hColor = gridLines.horizontalColor.value.value;
        const hWidth = gridLines.horizontalWidth.value;
        const hStyleVal = gridLines.horizontalStyle.value.value;
        const hStyle = showH ? `border-bottom: ${hWidth}px ${hStyleVal} ${hColor} !important;` : "";

        const showV = gridLines.showVertical.value;
        const vColor = gridLines.verticalColor.value.value;
        const vWidth = gridLines.verticalWidth.value;
        const vStyleVal = gridLines.verticalStyle.value.value;
        const vStyle = `border-right: ${vWidth}px ${vStyleVal} ${vColor} !important;`;

        const renderHeader = () => {
            // 2-Level Header if grouped
            let html = "";
            const isGrouped = this.columnGroups && this.columnGroups.length > 0;
            const globalFontSize = this.formattingSettings.layoutSettings.globalFontSize.value;
            const headerSettings = this.formattingSettings.columnsSettings.columnHeaderSettings;
            const font = headerSettings.font;

            const headerFontSize = font.fontSize.value > 0 ? font.fontSize.value : globalFontSize;

            const commonStyle = `
                font-family: ${font.fontFamily.value};
                font-size: ${headerFontSize}px;
                font-weight: ${font.bold.value ? "bold" : "normal"};
                font-style: ${font.italic.value ? "italic" : "normal"};
                text-decoration: ${font.underline.value ? "underline" : "none"};
                color: ${headerSettings.textColor.value.value};
                background-color: ${headerSettings.backgroundColor.value.value};
                text-align: ${headerSettings.alignment.value};
             `;

            // Row 1: Groups
            if (isGrouped) {
                html += `<tr style="background:#f0f0f0;">`;
                // Label Column (Row Header)
                // It spans 2 rows? Or we have "Group" Label above "Row Label"? 
                // User asked for "Group" input field.
                // "Group" can be e.g. "Month".
                // Let's create a cell for the Label Column that spans height or has a top label "Group".

                // If we match the screenshot:
                // Top Row: [Group Label] [Jan ...........] [Feb ...........]
                // Bot Row: [Row Label  ] [AC PY D D% ...] [AC PY D D% ...]

                const groupLabelText = this.formattingSettings.columnsSettings.columnLabels.headerGroupLabel.value || "";

                // Group Title Settings
                const gtSettings = this.formattingSettings.groupTitleSettings;
                const gtFont = gtSettings.fontFamily.value;
                const gtSizeVal = gtSettings.fontSize.value;
                const gtSize = gtSizeVal > 0 ? gtSizeVal : globalFontSize;
                const gtColor = gtSettings.fontColor.value.value;
                const gtAlign = gtSettings.alignment.value; // "left" | "center" | "right"

                // Group Width Style
                // Group Width Style
                const gtTextWrap = gtSettings.textWrap.value;
                let gtInnerStyle = "";

                if (gtSettings.textWidthMode.value.value === "fixed") {
                    const w = gtSettings.textWidth.value;
                    gtInnerStyle = `width:${w}px;max-width:${w}px;display:inline-block;vertical-align:bottom;`;
                    if (gtTextWrap) {
                        gtInnerStyle += `white-space:normal;word-wrap:break-word;`;
                    } else {
                        gtInnerStyle += `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                    }
                } else {
                    // Auto Mode
                    gtInnerStyle = gtTextWrap ? `white-space:normal;` : `white-space:nowrap;`;
                }

                // Render Top-Left Cell (Group Label) - Uses Column Header Settings (commonStyle)
                // Assuming it shares the same style as other headers, or should it use Group Title settings?
                // Let's keep it with commonStyle (Column Header) for consistency with the corner.
                html += `<th style="${commonStyle}${colBorder}border-bottom:1px solid #ccc;text-align:left;padding:5px 10px;">${this.escapeHtml(groupLabelText)}</th>`;

                this.columnGroups.forEach((g, i) => {
                    const isLastGroup = i === this.columnGroups.length - 1;
                    const span = columnKeys.filter(k => allColumns[k].group === g.name).length;

                    // Group Border Styles
                    const gb = this.formattingSettings.groupTitleSettings; // No, it's in BordersGroup
                    const borders = this.formattingSettings.gridlineSettings.bordersGroup;
                    const gbColor = borders.gbColor.value.value;
                    const gbW = borders.gbWidth.value;
                    const gbStyle = `
                        ${borders.gbTop.value ? `border-top: ${gbW}px solid ${gbColor};` : ""}
                        ${borders.gbLeft.value ? `border-left: ${gbW}px solid ${gbColor};` : ""}
                        ${borders.gbRight.value ? `border-right: ${gbW}px solid ${gbColor};` : ""}
                        /* Bottom border on header is usually existing separator, unless we want to override it */
                    `;

                    const grpThStyle = `
                        background-color: ${headerSettings.backgroundColor.value.value};
                        ${colBorder}
                        ${gbStyle}
                        ${showV && !isLastGroup && !borders.gbRight.value ? vStyle : ""}
                        border-bottom:1px solid #ccc;
                        padding: 5px 10px;
                        text-align: ${gtAlign}; 
                    `;

                    const fontStyle = `
                        font-family: ${gtFont};
                        font-size: ${gtSize}px;
                        color: ${gtColor};
                    `;

                    html += `<th colspan="${span}" style="${grpThStyle}${fontStyle}">
                        <div style="${gtInnerStyle}">${this.escapeHtml(g.displayName)}</div>
                    </th>`;
                });
                html += "</tr>";
            }

            html += `<tr style="background:#f0f0f0;${hStyle}">`;
            columnKeys.forEach((key, index) => {
                const colDef = allColumns[key];

                // If grouped, check if this is a measure column
                // For 'label' column in grouped mode, it might have been covered by the rowspan in Row 1?
                // Actually, if Row 1 has [Group Label] and [Jan], [Feb]...
                // Row 2 should have [Row Label] and [AC], [AC]...

                const enableSort = this.formattingSettings.layoutSettings.enableSorting.value;

                let widthStyle = "";
                const catSettings = this.formattingSettings.rowHeaderSettings;
                if (headerSettings.headerWidthMode.value.value === "fixed") {
                    if (key === "label") {
                        if (catSettings.textWidthMode.value.value === "fixed") {
                            widthStyle = `width:${catSettings.textWidth.value}px;min-width:${catSettings.textWidth.value}px;max-width:${catSettings.textWidth.value}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                        }
                    } else {
                        const isPct = key.endsWith("Pct");
                        const w = isPct ? headerSettings.widthForPercentage.value : headerSettings.widthForOthers.value;
                        widthStyle = `width:${w}px;min-width:${w}px;max-width:${w}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                    }
                } else if (key === "label" && catSettings.textWidthMode.value.value === "fixed") {
                    widthStyle = `width:${catSettings.textWidth.value}px;min-width:${catSettings.textWidth.value}px;max-width:${catSettings.textWidth.value}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                }

                const style = `
                    ${commonStyle}
                    white-space: ${headerSettings.textWrap.value ? "normal" : "nowrap"};
                    padding: 5px 10px;
                    ${enableSort ? "cursor:pointer;" : "cursor:default;"}
                    ${widthStyle}
                    position:relative;
                `;

                let icon = "";
                if (enableSort && this.sortColumn === key && this.sortDirection !== "none") {
                    icon = this.sortDirection === "asc" ? "▲" : "▼";
                }

                // Group Border Logic for Column Headers
                const borders = this.formattingSettings.gridlineSettings.bordersGroup;
                const gbColor = borders.gbColor.value.value;
                const gbW = borders.gbWidth.value;
                const gbStyle = borders.gbStyle.value.value as string;
                let gbHeaderStyle = "";

                if (colDef.group) {
                    const colsInGroup = columnKeys.filter(k => allColumns[k].group === colDef.group);
                    const firstCol = colsInGroup[0];
                    const lastCol = colsInGroup[colsInGroup.length - 1];

                    if (key === firstCol && borders.gbLeft.value) gbHeaderStyle += `border-left: ${gbW}px ${gbStyle} ${gbColor};`;
                    if (key === lastCol && borders.gbRight.value) gbHeaderStyle += `border-right: ${gbW}px ${gbStyle} ${gbColor};`;
                }

                // Determine if vStyle should be applied
                // Skip vStyle on last column of group when gbRight is applied
                // Also skip vStyle if the NEXT column is the first column of its group with gbLeft
                let skipVStyle = false;

                if (colDef.group) {
                    const colsInGroup = columnKeys.filter(k => allColumns[k].group === colDef.group);
                    const lastCol = colsInGroup[colsInGroup.length - 1];
                    if (key === lastCol && borders.gbRight.value) skipVStyle = true;
                }

                const nextColIndex = index + 1;
                const nextColKey = columnKeys[nextColIndex];
                if (nextColKey && allColumns[nextColKey]?.group && borders.gbLeft.value) {
                    const nextGroup = allColumns[nextColKey].group;
                    const colsInNextGroup = columnKeys.filter(k => allColumns[k].group === nextGroup);
                    if (nextColKey === colsInNextGroup[0]) skipVStyle = true;
                }

                const finalVStyle = showV && index < columnKeys.length - 1 && !skipVStyle ? vStyle : "";

                html += `<th class="matrix-header" draggable="true" data-column-key="${this.escapeHtml(key)}" style="${style}${finalVStyle}${colBorder}${gbHeaderStyle}">${this.escapeHtml(colDef.label)} ${this.escapeHtml(icon)}</th>`;
            });
            html += "</tr>";
            return html;
        };

        const renderRow = (row: PnLRow, index: number, isLastVisualRow: boolean): string => {
            const isSubtotal = row.isSubtotal || row.level === 0;
            const rowSettings = this.formattingSettings.rowHeaderSettings;
            const font = rowSettings.font;
            const padding = rowSettings.rowPadding ? rowSettings.rowPadding.value : 4;

            const disableExpand = this.formattingSettings.layoutSettings.disableExpandCollapse.value;
            const isCollapsed = this.collapsedRows.has(row.id);
            const hasChildren = row.children && row.children.length > 0;

            let iconChar = "";
            let iconStyle = this.formattingSettings.layoutSettings.iconStyle.value.value;
            if (hasChildren && !disableExpand) {
                if (iconStyle === "plusMinus") iconChar = isCollapsed ? "+" : "-";
                else if (iconStyle === "chevron") iconChar = isCollapsed ? ">" : "v";
                else iconChar = isCollapsed ? "▶" : "▼";
            }

            const isGrandTotal = row.id === "grand_total" || row.label === "Grand Total" || row.label === "Total";
            // Bold if: Grand Total OR Expanded Parent OR Explicitly Bold (Row/Global)
            const shouldBold = isGrandTotal || (hasChildren && !isCollapsed) || font.bold.value || row.format?.bold;
            const finalWeight = shouldBold ? "bold" : "normal";
            const finalStyle = (font.italic.value || row.format?.italic) ? "italic" : "normal";

            let extraBorder = "";
            if (font.underline.value || row.format?.underline) extraBorder += "border-bottom: 1px solid #000 !important;";
            if (row.format?.overline) extraBorder += "border-top: 1px solid #000 !important;";

            let bg = rowSettings.backgroundColor.value.value;
            if (rowSettings.showBandedRowColor.value && index % 2 !== 0) {
                bg = rowSettings.bandedRowColor.value.value;
            }
            if (row.format?.backgroundColor) bg = row.format.backgroundColor;

            // Determine if this is the last row for bottom group border
            // If total rows > index + 1?
            // Actually, we need to know the total count of rows being rendered.
            // But renderRow is recursive...
            // A simpler way: The "Grand Total" row usually is last if present. 
            // Or we just check index in the flat list if we flattened it? 
            // Current implementation `rows.map((r, i) => renderRow(r, i))` only iterates top level.
            // If we have hierarchy, we don't easily know if a row is the absolute last visual row.
            // However, the screenshot shows the border going down to the bottom of the visual.
            // If we apply border-bottom to every row in the group? No, that would be a grid.
            // Group Outline means only the very last row gets the bottom border.
            // For now, let's enable gbBottom on *every* row if the user wants vertical lines? 
            // No, "Outline" implies a box.
            // To do this correctly, we might need a container div or similar, OR we just apply it to the last row.
            // Let's defer gbBottom on data cells for a moment or apply it only if `isGrandTotal`? 
            // If Grand Total is at bottom, yes. 
            // But what if no Grand Total?
            // Let's assume for now we apply Left/Right interactions.

            // Group Border Settings
            const borders = this.formattingSettings.gridlineSettings.bordersGroup;
            const gbColor = borders.gbColor.value.value;
            const gbW = borders.gbWidth.value;
            const gbStyleVal = borders.gbStyle.value.value as string;

            const globalFontSize = this.formattingSettings.layoutSettings.globalFontSize.value;
            const rowFontSize = font.fontSize.value > 0 ? font.fontSize.value : globalFontSize;

            const trStyle = `
                font-family: ${font.fontFamily.value};
                font-size: ${rowFontSize}px;
                font-weight: ${finalWeight};
                font-style: ${finalStyle};
                text-decoration: none;
                color: ${rowSettings.textColor.value.value};
                background-color: ${bg};
                text-align: ${rowSettings.alignment.value};
                ${hStyle}
            `;

            const isDraggable = row.level === 0 ? 'draggable="true"' : "";

            // Keyboard Navigation Attributes
            const tabIndex = 'tabindex="0"';

            let rowHtml = `<tr data-row-id="${this.escapeHtml(row.id)}" ${isDraggable} ${tabIndex} style="${trStyle}">`;

            columnKeys.forEach((key, colIndex) => {
                const colDef = allColumns[key];
                const isLastCol = colIndex === columnKeys.length - 1;
                const cellVStyle = showV && !isLastCol ? vStyle : "";

                let cellWidthStyle = "";
                if (this.formattingSettings.columnsSettings.columnHeaderSettings.headerWidthMode.value.value === "fixed") {
                    if (key !== "label") {
                        const isPct = key.endsWith("Pct");
                        const w = isPct ? this.formattingSettings.columnsSettings.columnHeaderSettings.widthForPercentage.value : this.formattingSettings.columnsSettings.columnHeaderSettings.widthForOthers.value;
                        cellWidthStyle = `width:${w}px;min-width:${w}px;max-width:${w}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;`;
                    }
                }

                if (key === "label") {
                    const catSettings = rowSettings;
                    const indent = row.level * catSettings.indentation.value;
                    let widthStyle = "";
                    const textWrapStyle = catSettings.textWrap.value
                        ? "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                        : "white-space:nowrap;";

                    if (catSettings.textWidthMode.value.value === "fixed") {
                        widthStyle = `width:${catSettings.textWidth.value}px;min-width:${catSettings.textWidth.value}px;max-width:${catSettings.textWidth.value}px;overflow:hidden;text-overflow:ellipsis;`;
                    }
                    const cursor = (hasChildren && !disableExpand) ? "cursor:pointer;" : "";
                    const iconVisibility = hasChildren && !disableExpand ? 'visible' : 'hidden';
                    const iconTabIndex = (hasChildren && !disableExpand) ? 'tabindex="0"' : '';

                    rowHtml += `<td style="padding:${padding}px 10px;padding-left:${10 + indent}px;${widthStyle}${textWrapStyle}${cellVStyle};${extraBorder}${rowBorder}" title="${this.escapeHtml(colDef.render(row))}">
                        <span class="expand-icon" data-id="${this.escapeHtml(row.id)}" ${iconTabIndex} style="display:inline-block;width:15px;${cursor}margin-right:5px;text-align:center;visibility:${iconVisibility}">${this.escapeHtml(iconChar)}</span>
                        ${this.escapeHtml(colDef.render(row))}
                    </td>`;
                } else {
                    // Data Cell
                    // Check Left/Right Group Limits
                    const colGroup = colDef.group;
                    let gbStyle = "";
                    let skipCellVStyle = false;
                    if (colGroup) {
                        // Find all columns in this group
                        const colsInGroup = columnKeys.filter(k => allColumns[k].group === colGroup);
                        const firstCol = colsInGroup[0];
                        const lastCol = colsInGroup[colsInGroup.length - 1];

                        if (key === firstCol && borders.gbLeft.value) gbStyle += `border-left: ${gbW}px ${gbStyleVal} ${gbColor};`;
                        if (key === lastCol && borders.gbRight.value) {
                            gbStyle += `border-right: ${gbW}px ${gbStyleVal} ${gbColor};`;
                            skipCellVStyle = true;
                        }

                        // Bottom Border on Data Cells
                        if (isLastVisualRow && borders.gbBottom.value) {
                            gbStyle += `border-bottom: ${gbW}px ${gbStyleVal} ${gbColor};`;
                        }
                    }

                    // Also skip vStyle if next column is first of its group with gbLeft
                    const nextColIndex = colIndex + 1;
                    const nextColKey = columnKeys[nextColIndex];
                    if (nextColKey && allColumns[nextColKey]?.group && borders.gbLeft.value) {
                        const nextGroup = allColumns[nextColKey].group;
                        const colsInNextGroup = columnKeys.filter(k => allColumns[k].group === nextGroup);
                        if (nextColKey === colsInNextGroup[0]) {
                            skipCellVStyle = true;
                        }
                    }

                    const finalCellVStyle = skipCellVStyle ? "" : cellVStyle;

                    rowHtml += `<td data-column-key="${this.escapeHtml(key)}" style="text-align:right;padding:${padding}px 10px;${finalCellVStyle}${cellWidthStyle};${extraBorder}${valBorder}${gbStyle}">${colDef.render(row)}</td>`;
                }
            });
            // Recursion removed from here, handled in main loop
            // rowHtml += row.children.map((c, i) => renderRow(c, i)).join("");

            return rowHtml;
        };

        // --- Build HTML ---
        this.clearNode(this.container);
        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";

        // Flatten visible rows
        const flatRows: PnLRow[] = [];
        const flatten = (nodes: PnLRow[]) => {
            nodes.forEach(r => {
                flatRows.push(r);
                // Only expand if NOT collapsed
                const hasChildren = r.children && r.children.length > 0;
                // Actually, logic is: if hasChildren and !collapsed, then show children.
                // But wait, renderRow normally *renders* the current row, and *then* its children.
                // So we add current row, then if expanded, add children.
                const isCollapsed = this.collapsedRows.has(r.id);
                if (hasChildren && !this.formattingSettings.layoutSettings.disableExpandCollapse.value && !isCollapsed) {
                    flatten(r.children);
                }
            });
        };
        flatten(rows);

        let html = `<thead>${renderHeader()}</thead><tbody>`;
        html += flatRows.map((r, i) => renderRow(r, i, i === flatRows.length - 1)).join("");
        html += "</tbody>";

        this.setNodeHtml(table, html);
        this.container.appendChild(table);

        this.attachEvents(this.formattingSettings.layoutSettings.disableExpandCollapse.value);
    }

    private attachEvents(disableExpand: boolean) {
        if (!disableExpand) {
            this.container.querySelectorAll(".expand-icon").forEach((span: HTMLElement) => {
                span.addEventListener("click", (e) => {
                    e.stopPropagation();
                    const rowId = span.getAttribute("data-id");
                    if (rowId) {
                        if (this.collapsedRows.has(rowId)) {
                            this.collapsedRows.delete(rowId);
                        } else {
                            this.collapsedRows.add(rowId);
                        }
                        this.render();
                    }
                });
                // Keyboard support for Expand/Collapse
                span.addEventListener("keydown", (e: KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        span.click();
                    }
                });
            });
        }

        // Row Selection (Cross-filtering) & Keyboard Navigation
        const allRows = Array.from(this.container.querySelectorAll("tr[data-row-id]")) as HTMLElement[];

        allRows.forEach((tr: HTMLElement, index: number) => {
            tr.addEventListener("click", (e) => {
                // Ignore if clicked on expand icon (handled individually)
                if ((e.target as HTMLElement).classList.contains("expand-icon")) return;

                const rowId = tr.getAttribute("data-row-id");
                if (rowId) {
                    const row = this.findRowById(rowId, this.currentRows);
                    if (row && row.selectionId) {
                        this.selectionManager.select(row.selectionId).then((ids: ISelectionId[]) => {
                            // Optional: dim unselected rows
                        });
                        e.stopPropagation();
                    }
                }
            });

            // Keyboard Navigation
            tr.addEventListener("keydown", (e: KeyboardEvent) => {
                // If focus is on the expand icon, let it handle the event (unless it's navigation)
                const isIcon = (e.target as HTMLElement).classList.contains("expand-icon");

                if (e.key === "ArrowDown") {
                    e.preventDefault();
                    const next = allRows[index + 1];
                    if (next) next.focus();
                } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    const prev = allRows[index - 1];
                    if (prev) prev.focus();
                } else if ((e.key === "Enter" || e.key === " ") && !isIcon) {
                    e.preventDefault();
                    tr.click();
                }
            });
        });

        // Row Context Menu
        this.container.querySelectorAll("tr").forEach((tr: HTMLElement) => {
            tr.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                const rowId = tr.getAttribute("data-row-id");
                if (rowId) {
                    this.contextMenu.setAttribute("data-target-id", rowId);
                    this.hideSettingsMenu(); // Hide other menu first
                    this.contextMenu.style.display = "block";

                    // Boundary detection
                    const menuWidth = this.contextMenu.offsetWidth || 150;
                    const menuHeight = this.contextMenu.offsetHeight || 200;
                    const viewportWidth = window.innerWidth;
                    const viewportHeight = window.innerHeight;

                    let left = e.clientX;
                    let top = e.clientY;

                    if (left + menuWidth > viewportWidth) {
                        left = viewportWidth - menuWidth - 5;
                    }
                    if (top + menuHeight > viewportHeight) {
                        top = viewportHeight - menuHeight - 5;
                    }

                    this.contextMenu.style.left = left + "px";
                    this.contextMenu.style.top = top + "px";
                }
            });
        });

        // Column Header Click (Sorting) and Context Menu
        this.container.querySelectorAll("th.matrix-header").forEach((th: HTMLElement) => {
            th.addEventListener("click", () => {
                if (!this.formattingSettings.layoutSettings.enableSorting.value) return;
                const colKey = th.getAttribute("data-column-key");
                if (colKey) this.handleSort(colKey as SortColumn);
            });

            th.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                const colKey = th.getAttribute("data-column-key");
                if (colKey) {
                    this.hideContextMenu(); // Hide row menu first
                    this.showSettingsMenu(e.clientX, e.clientY, colKey);
                }
            });

            // Column Header DnD
            th.addEventListener("dragstart", (e) => {
                const colKey = th.getAttribute("data-column-key");
                if (colKey) {
                    this.dragSourceColKey = colKey;
                    e.dataTransfer!.effectAllowed = "move";
                    th.style.opacity = "0.5";
                }
            });

            th.addEventListener("dragend", () => {
                th.style.opacity = "1";
                this.dragSourceColKey = null;
                // Remove visual feedback
                this.container.querySelectorAll("th.matrix-header").forEach((h: HTMLElement) => {
                    h.style.borderLeft = "";
                    h.style.borderRight = "";
                });
            });

            th.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer!.dropEffect = "move";

                const targetKey = th.getAttribute("data-column-key");
                if (this.dragSourceColKey && targetKey && this.dragSourceColKey !== targetKey) {
                    // Live Reorder Columns
                    // 1. Find indexes
                    const headers = Array.from(this.container.querySelectorAll("th.matrix-header"));
                    const fromIndex = headers.findIndex(h => h.getAttribute("data-column-key") === this.dragSourceColKey);
                    const toIndex = headers.findIndex(h => h.getAttribute("data-column-key") === targetKey);

                    if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                        // Move Header
                        const parent = th.parentNode;
                        const fromHeader = headers[fromIndex];
                        const toHeader = headers[toIndex];

                        // Insert before or after based on direction
                        // Actually, just inserting before 'toHeader' (if moving right to left) or after (if left to right)
                        // Simple approach: standard node swap logic
                        // If moving down (from < to), insert after to. 
                        // If moving up (from > to), insert before to.

                        // DOM manipulation
                        if (fromIndex < toIndex) {
                            parent?.insertBefore(fromHeader, toHeader.nextSibling);
                        } else {
                            parent?.insertBefore(fromHeader, toHeader);
                        }

                        // Move Data Cells in every row
                        this.container.querySelectorAll("tbody tr").forEach((row: HTMLTableRowElement) => {
                            const cells = Array.from(row.children) as HTMLTableCellElement[];
                            // Note: first cell is row header, so data columns start at index 1? 
                            // Wait, renderRow adds 'td' for each columnKey. 
                            // If "label" is in columnKeys, it's just another cell.
                            // Let's assume columnKeys index matches cell index roughly.
                            // We should match cells by some criteria or just index if consistent.
                            // headers array corresponds to columnKeys.

                            // Let's assume cells match headers 1:1.
                            // Caveat: Row header might be separate? 
                            // in 'renderHeader', we iterate columnKeys.
                            // in 'renderRow', we iterate columnKeys.
                            // So yes, 1:1.

                            if (cells[fromIndex] && cells[toIndex]) {
                                if (fromIndex < toIndex) {
                                    row.insertBefore(cells[fromIndex], cells[toIndex].nextSibling);
                                } else {
                                    row.insertBefore(cells[fromIndex], cells[toIndex]);
                                }
                            }
                        });
                    }
                }
            });

            th.addEventListener("drop", (e) => {
                e.preventDefault();
                e.stopPropagation();

                // On drop, we just need to save the current order from DOM
                const newOrder: string[] = [];
                this.container.querySelectorAll("th.matrix-header").forEach((h: HTMLElement) => {
                    const k = h.getAttribute("data-column-key");
                    if (k) newOrder.push(k);
                });

                // Persist
                this.formattingSettings.layoutSettings.columnOrder.value = newOrder.join(",");
                this.host.persistProperties({
                    merge: [
                        {
                            objectName: "layoutSettings",
                            properties: {
                                columnOrder: newOrder.join(",")
                            },
                            selector: null
                        }
                    ]
                });

                this.dragSourceColKey = null;
                this.container.querySelectorAll("th.matrix-header").forEach((h: HTMLElement) => {
                    h.style.opacity = "1";
                    h.style.borderLeft = "";
                    h.style.borderRight = "";
                });
            });
        });

        // Drag and Drop
        let dragSourceRowId: string | null = null;
        this.container.querySelectorAll("tr[draggable='true']").forEach((tr: HTMLElement) => {
            tr.addEventListener("dragstart", (e) => {
                dragSourceRowId = tr.getAttribute("data-row-id");
                e.dataTransfer!.effectAllowed = "move";
                tr.style.opacity = "0.5";
            });
            tr.addEventListener("dragend", () => {
                tr.style.opacity = "1";
                dragSourceRowId = null;
            });
            tr.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.dataTransfer!.dropEffect = "move";
                tr.style.background = "#e6f7ff"; // Keep highlight

                const targetRowId = tr.getAttribute("data-row-id");
                if (dragSourceRowId && targetRowId && dragSourceRowId !== targetRowId) {
                    // Live Reorder Rows (siblings only)
                    // Check if same parent
                    const parent = tr.parentNode;
                    const sourceTr = this.container.querySelector(`tr[data-row-id='${dragSourceRowId}']`);

                    if (sourceTr && sourceTr.parentNode === parent) {
                        // Get all rows to find indexes
                        const rows = Array.from(parent.children);
                        const fromIndex = rows.indexOf(sourceTr);
                        const toIndex = rows.indexOf(tr);

                        if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
                            // Swap DOM
                            if (fromIndex < toIndex) {
                                parent.insertBefore(sourceTr, tr.nextSibling);
                            } else {
                                parent.insertBefore(sourceTr, tr);
                            }
                        }
                    }
                }
            });
            tr.addEventListener("dragleave", () => {
                tr.style.background = "";
            });
            tr.addEventListener("drop", (e) => {
                e.preventDefault();
                e.stopPropagation();
                tr.style.background = "";

                // On drop, save the new order based on DOM (which is already visually updated by dragover)
                const newOrder: Record<string, string[]> = {};
                const parentMap = new Map<string, string>();

                // Helper to build parent map from current model
                const buildParentMap = (nodes: PnLRow[], pid: string = "root") => {
                    nodes.forEach(n => {
                        parentMap.set(n.id, pid);
                        if (n.children) buildParentMap(n.children, n.id);
                    });
                };
                if (this.currentRows) buildParentMap(this.currentRows);

                // Scrape DOM to reconstruct order
                this.container.querySelectorAll("tr[data-row-id]").forEach((r) => {
                    const id = r.getAttribute("data-row-id");
                    if (id) {
                        const pid = parentMap.get(id) || "root";
                        if (!newOrder[pid]) newOrder[pid] = [];
                        newOrder[pid].push(id);
                    }
                });

                // Update Internal State & Flag
                this.rowOrder = newOrder;
                this.isManualSort = true;

                // Persist to layoutSettings.rowOrder
                this.host.persistProperties({
                    merge: [{
                        objectName: "layoutSettings",
                        properties: {
                            rowOrder: JSON.stringify(this.rowOrder)
                        },
                        selector: null
                    }]
                });

                dragSourceRowId = null;
                this.container.querySelectorAll("tr").forEach(t => t.style.opacity = "1");
            });
        });
    }

    private hideSettingsMenu() {
        if (this.settingsMenu) this.settingsMenu.style.display = "none";
    }

    // Helper to store last options for re-update
    private lastOptions: VisualUpdateOptions | undefined;

    // ...

    private dragSourceColKey: string | null = null;

    private reorderColumns(sourceKey: string, targetKey: string) {
        let currentOrder = this.formattingSettings.layoutSettings.columnOrder.value
            .split(",")
            .map(s => s.trim())
            .filter(s => s);

        // If generic currentOrder didn't correspond to actual keys (e.g. empty or default), we might need to use the computed keys
        // But for persistence, we only care about the explicit list.
        // However, if the user hasn't set custom order yet, the string might be default.

        // Ensure source and target are in the list.
        if (!currentOrder.includes(sourceKey)) currentOrder.push(sourceKey);
        if (!currentOrder.includes(targetKey)) currentOrder.push(targetKey);

        const sourceIndex = currentOrder.indexOf(sourceKey);
        currentOrder.splice(sourceIndex, 1);

        const targetIndex = currentOrder.indexOf(targetKey);
        currentOrder.splice(targetIndex, 0, sourceKey);

        const newOrderString = currentOrder.join(", ");

        this.host.persistProperties({
            merge: [
                {
                    objectName: "layoutSettings",
                    properties: {
                        columnOrder: newOrderString
                    },
                    selector: null
                }
            ]
        });
    }

    private reorderRows(sourceId: string, targetId: string) {
        // Only support top-level sorting for now
        const nodes = this.currentRows;
        const srcIdx = nodes.findIndex(n => n.id === sourceId);
        const tgtIdx = nodes.findIndex(n => n.id === targetId);

        // Safety checks: ensure both source and target are valid and not grand total
        if (srcIdx < 0 || tgtIdx < 0 || sourceId === "grand_total" || targetId === "grand_total") {
            console.warn("Invalid row reorder attempt or trying to reorder grand total.");
            return;
        }

        const moved = nodes[srcIdx];
        nodes.splice(srcIdx, 1);
        nodes.splice(tgtIdx, 0, moved);

        // Update Row Order Config for root only
        const newOrder = nodes.map(n => n.id);
        this.rowOrder["root"] = newOrder;

        // Force immediate render for "stitch" effect
        this.isManualSort = true;
        this.render();

        // Persist
        this.host.persistProperties({
            merge: [{
                objectName: "layoutSettings",
                properties: {
                    rowOrder: JSON.stringify(this.rowOrder)
                },
                selector: null
            }]
        });
    }




    private handleSort(col: SortColumn) {
        if (this.sortColumn === col) {
            // Toggle: Asc -> Desc -> None
            if (this.sortDirection === "asc") {
                this.sortDirection = "desc";
            } else if (this.sortDirection === "desc") {
                this.sortDirection = "none";
                this.sortColumn = null;
            } else {
                this.sortDirection = "asc";
            }
        } else {
            this.sortColumn = col;
            this.sortDirection = "asc";
        }
        this.isManualSort = false; // Reset manual sort flag on explicit column sort
        this.render();
    }










    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    private findRowById(id: string, rows: PnLRow[]): PnLRow | undefined {
        for (const r of rows) {
            if (r.id === id) return r;
            if (r.children && r.children.length > 0) {
                const found = this.findRowById(id, r.children);
                if (found) return found;
            }
        }
        return undefined;
    }

    private handleLandingPage(options: VisualUpdateOptions) {
        if (!options.dataViews || !options.dataViews.length || !options.dataViews[0].matrix ||
            !options.dataViews[0].matrix.rows || !options.dataViews[0].matrix.rows.root ||
            !options.dataViews[0].matrix.rows.root.children || options.dataViews[0].matrix.rows.root.children.length === 0) {
            this.clearNode(this.container);
            const landingDiv = document.createElement("div");
            landingDiv.style.width = "100%";
            landingDiv.style.height = "100%";
            landingDiv.style.display = "flex";
            landingDiv.style.flexDirection = "column";
            landingDiv.style.alignItems = "center";
            landingDiv.style.justifyContent = "center";
            landingDiv.style.color = "#666";
            landingDiv.style.fontFamily = "Segoe UI, sans-serif";
            landingDiv.style.textAlign = "center";

            const title = document.createElement("div");
            title.style.fontSize = "24px";
            title.style.fontWeight = "600";
            title.style.marginBottom = "20px";
            title.textContent = "P&L Matrix";

            const subtitle = document.createElement("div");
            subtitle.style.fontSize = "14px";
            subtitle.textContent = "Please add data fields to start.";

            const helper = document.createElement("div");
            helper.style.fontSize = "12px";
            helper.style.marginTop = "10px";
            helper.style.color = "#999";
            helper.textContent = 'Drag "Row Headers" and Values to the visual.';

            landingDiv.append(title, subtitle, helper);

            this.container.appendChild(landingDiv);
        }
    }


}
