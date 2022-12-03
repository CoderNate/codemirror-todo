import "./styles.css";

//import { basicSetup } from "codemirror";
import { basicSetup } from "./basicsetup";
//mport { deleteLine } from "@codemirror/commands";
import {
  Command,
  EditorView,
  KeyBinding,
  keymap,
  WidgetType,
  ViewPlugin,
  Decoration,
  DecorationSet,
  ViewUpdate
} from "@codemirror/view";

import {} from "@codemirror/view";

import { syntaxTree } from "@codemirror/language";
//import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { Vim, vim } from "@replit/codemirror-vim";
import { Compartment, EditorSelection } from "@codemirror/state";
import { SyntaxNodeRef } from "@lezer/common";

const baseUrl = "http://localhost:8675/";

(document as any).updateTodos = async () => {
  await fetch(baseUrl + "doupdates", { method: "POST" });
  window.location.reload();
};

// Write TypeScript code!
const appDiv: HTMLElement = document.getElementById("app")!;
appDiv.innerHTML = `<h1>To do</h1>
<button onclick="updateTodos()">Update & Reload</button>
<div id="editor" />`;

// Based on https://discuss.codemirror.net/t/concealing-syntax/3135/3
class ConcealWidget extends WidgetType {
  constructor(readonly symbol: string) {
    console.log(
      "TODO: Figure out why codesandbox.io doesnt like me calling super"
    );
    // super();
  }

  eq(other: ConcealWidget) {
    return other.symbol === this.symbol;
  }

  toDOM() {
    let span = document.createElement("span");
    span.className = "cm-concealed-sym"; // Formatting to be taken care of
    span.textContent = this.symbol;
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

function selectionAndRangeOverlap(
  selection: EditorSelection,
  rangeFrom: number,
  rangeTo: number
) {
  return selection.main.from <= rangeTo && selection.main.to >= rangeFrom;
}

function iterateVisibleNodes(
  view: EditorView,
  onNode: (n: SyntaxNodeRef) => void
) {
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({ from, to, enter: onNode });
  }
}

function conceal(view: EditorView) {
  const concealMap: { [id: string]: string } = {
    "!=": "≠",
    "<=": "≤",
    ">=": "≥"
    // and so on...
  };

  let widgets: any = [];
  iterateVisibleNodes(view, (node) => {
    const toSkip = selectionAndRangeOverlap(
      view.state.selection,
      node.from,
      node.to
    );
    if (toSkip) {
      return;
    }

    if (node.name === "CompareOp" || node.name === "LogicOp") {
      const s: string = view.state.doc.sliceString(node.from, node.to);
      //console.log({fr: type.from, to: type.to});
      if (!concealMap.hasOwnProperty(s)) {
        return;
      }
      widgets.push(
        Decoration.replace({
          widget: new ConcealWidget(concealMap[s]),
          inclusive: false,
          block: false
        }).range(node.from, node.to)
      );
    }

    if (node.name === "ListMark") {
      const checkboxRange = { from: node.to + 1, to: node.to + 4 };
      const selectionOverlaps = selectionAndRangeOverlap(
        view.state.selection,
        checkboxRange.from,
        checkboxRange.to
      );
      const text = view.state.doc.sliceString(
        checkboxRange.from,
        checkboxRange.to
      );
      const replacement = text === "[x]" ? "☑️" : text === "[ ]" ? "☐" : null;
      if (!selectionOverlaps && replacement) {
        widgets.push(
          Decoration.replace({
            widget: new ConcealWidget(replacement),
            inclusive: false,
            block: false
          }).range(checkboxRange.from, checkboxRange.to)
        );
      }
    }
    if (node.name === "URL") {
      //const s: string = view.state.doc.sliceString(node.from, node.to);
      // (s.startsWith('[') && s.endsWith(']')) {
      widgets.push(
        Decoration.replace({
          widget: new ConcealWidget("..."),
          inclusive: false,
          block: false
        }).range(node.from, node.to)
      );
    }
  });

  return Decoration.set(widgets, true);
}

export const concealPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = conceal(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet)
        this.decorations = conceal(update.view);
    }
  },
  { decorations: (v) => v.decorations }
);

export const dummyCommand: Command = (view) => {
  // For more command examples see https://github.com/codemirror/commands/blob/main/src/commands.ts
  const changes = view.state.changes({
    from: 0,
    to: view.state.doc.length,
    insert: "XXX"
  });
  view.dispatch({ changes });
  return true;
};
export const myKeymap: readonly KeyBinding[] = [
  {
    key: "Alt-ArrowLeft",
    run: dummyCommand
  }
];

function range(from: number, to: number) {
  const result: number[] = Array(to - from + 1);
  for (let i = from; i <= to; i++) {
    result[i - from] = i;
  }
  return result;
}

function debounce<T extends Function>(func: T, timeout = 600): T {
  let timer: number;
  const rslt: any = (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
  return rslt;
}
async function startup() {
  const loadResponse = await fetch(baseUrl + "load");
  const txt = await loadResponse.text();
  let view: EditorView;
  let saveChanges = debounce(async () => {
    await fetch(baseUrl + "save", {
      method: "POST",
      body: view.state.doc.sliceString(0, view.state.doc.length)
    });
    console.log("Save finished!");
  });

  //let language = new Compartment();
  view = new EditorView({
    doc: txt,
    extensions: [
      // make sure vim is included before other keymaps
      vim(),
      // include the default keymap and all other keymaps you want to use in insert mode
      keymap.of(myKeymap),
      basicSetup,
      EditorView.lineWrapping,
      concealPlugin,
      //language.of(javascript()),
      markdown(),
      EditorView.updateListener.of((upd) => {
        if (upd.docChanged) {
          saveChanges();
        }
      })
    ],
    parent: document.querySelector("#editor")!
  });
  //const cm = getCM(view);
  Vim.defineAction("openlink", (cm: any) => {
    const r = view.state.selection.ranges[0];
    iterateVisibleNodes(view, async (node) => {
      if (node.name === "URL" && node.from <= r.from && node.to >= r.from) {
        const url = view.state.doc
          .sliceString(node.from, node.to)
          .replace(/^</, "")
          .replace(/>$/, "");
        //window.open(url, "_blank");
        await fetch(baseUrl + "openurl/" + encodeURIComponent(url), {
          method: "POST"
        });
      }
    });
  });
  Vim.mapCommand("gx", "action", "openlink");

  Vim.defineAction("toggleCheckbox", (cm: any) => {
    const r = view.state.selection.ranges[0];
    const startLine = view.state.doc.lineAt(r.from);
    const m = startLine.text.match(/^\s*- \[(x| )\]/);
    if (m) {
      const startIndex = startLine.from + startLine.text.indexOf("[") + 1;
      const isChecked = m[1] === "x";
      const insertDoneChanges = isChecked
        ? []
        : [
            {
              from: startLine.to,
              insert: " #DONE:" + new Date().toLocaleDateString("en-CA")
            }
          ];
      const changes = view.state.changes([
        {
          from: startIndex,
          to: startIndex + 1,
          insert: isChecked ? " " : "x"
        },
        ...insertDoneChanges
      ]);
      view.dispatch({ changes });
    }
  });
  Vim.mapCommand("<Space>", "action", "toggleCheckbox");

  Vim.defineAction("moveCompletedTodos", (cm: any) => {
    const r = view.state.selection.ranges[0];
    const doc = view.state.doc;
    const startLine = doc.lineAt(r.from);
    const endLine = doc.lineAt(r.to);
    const lineInfos = range(startLine.number, endLine.number).map((lineIdx) => {
      const line = doc.line(lineIdx);
      const m = line.text.match(/^\s*- \[(x| )\]/);
      return {
        indent: line.text.match(/^\s*/)![0].length,
        isDone: !!m && m[1] === "x",
        hasCheckbox: !!m,
        from: line.from,
        to: line.to
      };
    });
    const unfinishedLines: string[] = [];
    const finishedLines: string[] = [];
    for (let infIdx = 0; infIdx < lineInfos.length; infIdx++) {
      const inf = lineInfos[infIdx];
      let endInfIdx = infIdx;
      while (
        endInfIdx + 1 < lineInfos.length &&
        (lineInfos[endInfIdx + 1].indent > inf.indent ||
          (lineInfos[endInfIdx + 1].indent >= inf.indent &&
            !lineInfos[endInfIdx + 1].hasCheckbox))
      ) {
        endInfIdx += 1;
      }
      const linesText = doc.sliceString(inf.from, lineInfos[endInfIdx].to);
      if (inf.isDone) {
        finishedLines.push(linesText);
      } else {
        unfinishedLines.push(linesText);
      }
      infIdx = endInfIdx;
    }
    let insertPos = -1;
    for (let lineIndex = 1; lineIndex <= doc.lines; lineIndex++) {
      if (doc.line(lineIndex).text === "# Completed") {
        insertPos = doc.line(lineIndex + 1).from;
        break;
      }
    }
    const changes = [
      {
        from: startLine.from,
        to: endLine.to,
        insert: unfinishedLines.join("\n")
      },
      {
        from: insertPos,
        insert: finishedLines.join("\n") + "\n"
      }
    ];
    view.dispatch({ changes: view.state.changes(changes) });
  });
  Vim.mapCommand("\\\\", "action", "moveCompletedTodos");
  Vim.unmap("<C-c>"); // Use Ctrl+c for copy instead of VIM's command
  Vim.unmap("<C-c>", "insert");
  Vim.unmap("<C-v>"); // Use Ctrl+v for paste instead of VIM's command
  Vim.unmap("<C-v>", "insert");
}

startup();
