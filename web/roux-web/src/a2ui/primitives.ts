// roux's A2UI primitives: the components the renderer implements and the drawing agent draws with. Everything above
// them (composites, screens) is built from these.
import {
  array,
  bindable,
  boolean,
  checks,
  children,
  component,
  event,
  fieldOf,
  integer,
  literal,
  list,
  map,
  number,
  oneOf,
  optional,
  options,
  param,
  record,
  text,
} from "./builder";
import { toA2ui } from "./translate";

export const CATALOG_ID = "https://jwcarman.github.io/roux/a2ui/catalog-v1.json";
export const CATALOG_VERSION = "0.1.0";

const tone = oneOf(["neutral", "info", "success", "warning", "danger"]);
const justify = optional(
  literal(oneOf(["start", "center", "end", "spaceBetween", "spaceAround", "spaceEvenly", "stretch"])),
);
const align = optional(literal(oneOf(["start", "center", "end", "stretch"])));
const weight = optional(literal(number));

const Column = component("Column")
  .prop("children", children())
  .prop("gap", optional(literal(number)))
  .prop("justify", justify)
  .prop("align", align)
  .childProp("weight", weight)
  .describe(
    "Stacks its children vertically. The usual root of a screen. " +
      "justify places the children along the column (spaceBetween pushes them to the top and bottom); align lines " +
      "them up across it. A child's weight (1, 2, ...) gives it that many shares of the spare height.",
  )
  .build();

const Row = component("Row")
  .prop("children", children())
  .prop("gap", optional(literal(number)))
  .prop("justify", justify)
  .prop("align", align)
  .childProp("weight", weight)
  .describe(
    "Lays its children side by side; wraps on narrow screens. Children share the width equally, unless justify is " +
      "set: then each takes its own width and justify places them (end for buttons on the right, spaceBetween to " +
      "push them to the edges). align lines them up vertically. A child's weight (1, 2, ...) gives it that many " +
      "shares of the width.",
  )
  .build();

const Heading = component("Heading")
  .prop("text", bindable(text))
  .prop("size", optional(literal(oneOf(["sm", "md", "lg", "xl", "2xl"]))))
  .describe("A heading. Use size xl for the screen's title (one per screen).")
  .build();

const Text = component("Text")
  .prop("text", bindable(text))
  .prop("muted", optional(literal(boolean)))
  .describe("A paragraph. muted for secondary text such as a screen's one-line explanation.")
  .build();

const Card = component("Card")
  .prop("title", optional(bindable(text)))
  .prop("tone", optional(literal(oneOf(["neutral", "warning", "danger"]))))
  .prop("children", children())
  .describe(
    'A bordered panel with an optional title; groups related content. tone colors the border: warning or danger for "needs attention" groups.',
  )
  .build();

const StatValue = param("V");
const Stat = component("Stat")
  .generic(StatValue)
  .prop("label", bindable(text))
  .prop("value", bindable(StatValue))
  .prop("format", optional(literal(oneOf(["number", "money"]))))
  .rule("value is money when format is money, otherwise a number")
  .describe(
    'One headline number with a label, e.g. "Customers 42". format money expects {minorUnits, currency}. Put each Stat in its own Card inside a Row.',
  )
  .build();

const Button = component("Button")
  .prop("label", bindable(text))
  .prop("action", event())
  .prop("variant", optional(literal(oneOf(["solid", "outline", "ghost"]))))
  .prop("disabled", optional(bindable(boolean)))
  .describe("A button. Its action is an event the app handles (name it as a verb: saveCustomer, sendInvoice).")
  .build();

const TableRow = param("T");
const DataTable = component("DataTable")
  .generic(TableRow)
  .prop(
    "columns",
    literal(
      array(
        record({
          header: text,
          field: fieldOf(TableRow),
          sort: optional(text),
          format: optional(oneOf(["text", "money", "date", "time", "badge", "list"])),
          tones: optional(map(tone)),
          link: optional(record({ to: text, params: map(fieldOf(TableRow)) })),
        }),
      ),
    ),
  )
  .prop("rows", bindable(list(TableRow)))
  .prop("pageIndex", optional(bindable(integer)))
  .prop("sortBy", optional(bindable(text)))
  .prop("sortDirection", optional(bindable(oneOf(["ASC", "DESC"]))))
  .prop("emptyText", optional(literal(text)))
  .rule("a column's format fits its field's type: money for a money field, date for a date field")
  .describe(
    "A paged, sortable table of records. rows binds to a page of records in the data model; paging writes pageIndex. " +
      "Each column shows one field; a column with sort is sortable: clicking its header writes sortBy (the column's sort) and sortDirection. " +
      'link makes the column\'s cells links to an app route whose $params are row fields: {to: "/jobs/$id", params: {id: "id"}}. ' +
      "format: date for ISO dates (yyyy-mm-dd), time for a time of day as HH:mm (10:30), money for {minorUnits, currency}, " +
      'badge for a short status word, list for an array of strings shown joined with ", ". ' +
      'tones colors badges by value: {"Unassigned": "warning", "Done": "success"} (neutral, info, success, warning, danger).',
  )
  .build();

const CardRow = param("T");
const CardList = component("CardList")
  .generic(CardRow)
  .prop("rows", bindable(list(CardRow)))
  .prop("title", literal(fieldOf(CardRow)))
  .prop(
    "lines",
    literal(array(record({ field: fieldOf(CardRow), format: optional(oneOf(["text", "money", "date"])) }))),
  )
  .prop("badge", optional(literal(record({ field: fieldOf(CardRow), tones: optional(map(tone)) }))))
  .prop("emptyText", optional(literal(text)))
  .rule("a line's format fits its field's type: money for a money field, date for a date field")
  .describe(
    "The phone-friendly list: one card per record. Use instead of DataTable on phone moments. " +
      "rows binds to an array in the data model; title is the field shown as each card's heading; " +
      "lines are further fields shown under it (format: text, money, date); badge shows one field as a status word, " +
      "with tones mapping value to neutral, info, success, warning or danger.",
  )
  .build();

const Form = component("Form")
  .prop("children", children())
  .describe("Holds input fields and the button that saves them. Every InputField must be inside a Form.")
  .build();

const InputField = component("InputField")
  .prop("label", bindable(text))
  .prop("value", bindable(text))
  .prop("type", optional(literal(oneOf(["text", "email", "tel", "date", "time"]))))
  .prop("required", optional(literal(boolean)))
  .prop("helperText", optional(bindable(text)))
  .prop("serverError", optional(bindable(text)))
  .prop("@checks", checks())
  .describe(
    "A labelled text input bound to a data-model path. serverError binds to where the app writes the server's message " +
      "for this field. @checks are the field's rules (required, email, regex, length), each with the message to show.",
  )
  .build();

const SelectField = component("SelectField")
  .prop("label", bindable(text))
  .prop("value", bindable(text))
  .prop("options", bindable(options(text)))
  .prop("placeholder", optional(literal(text)))
  .prop("required", optional(literal(boolean)))
  .prop("helperText", optional(bindable(text)))
  .prop("serverError", optional(bindable(text)))
  .prop("@checks", checks())
  .describe(
    "A labelled drop-down of choices, bound to a data-model path. options is a list of {value, label} " +
      "(literal, or bound to a list in the data). Must be inside a Form.",
  )
  .build();

/** roux's primitives, in the order the drawing prompt lists them. */
export const PRIMITIVES = [
  SelectField,
  CardList,
  Column,
  Row,
  Heading,
  Text,
  Card,
  Stat,
  Button,
  DataTable,
  Form,
  InputField,
] as const;

/** roux's catalog, translated for the A2UI SDK. */
export const rouxCatalog = toA2ui(PRIMITIVES, { catalogId: CATALOG_ID, version: CATALOG_VERSION });
