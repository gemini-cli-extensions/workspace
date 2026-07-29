/**
 * @file docs/locate.ts
 * @description Pure helpers to locate a table's indices in a raw Docs document,
 * so the factories can fill/style cells after inserting a table. Testable with
 * synthetic doc JSON.
 */

export interface TableCell {
  rowIndex: number;
  colIndex: number;
  /** Start index of the cell's first paragraph (where text is inserted). */
  startIndex: number;
}
export interface LocatedTable {
  /** The table element's own start index (for tableCellLocation.tableStartLocation). */
  tableStartIndex: number;
  rows: number;
  cols: number;
  cells: TableCell[];
}

/** Body content for a tab (with includeTabsContent) or the legacy root body. */
export function docBodyContent(rawDoc: any, tabId?: string): any[] {
  if (Array.isArray(rawDoc?.tabs) && rawDoc.tabs.length) {
    const tab = tabId ? rawDoc.tabs.find((t: any) => t?.tabProperties?.tabId === tabId) : rawDoc.tabs[0];
    return tab?.documentTab?.body?.content ?? [];
  }
  return Array.isArray(rawDoc?.body?.content) ? rawDoc.body.content : [];
}

/** Locate the LAST table in the doc (the one a factory just inserted). */
export function findLastTable(rawDoc: any, tabId?: string): LocatedTable | null {
  const content = docBodyContent(rawDoc, tabId);
  let last: any = null;
  for (const el of content) if (el?.table) last = el;
  if (!last) return null;

  const cells: TableCell[] = [];
  const tableRows: any[] = last.table.tableRows ?? [];
  tableRows.forEach((row: any, r: number) => {
    (row.tableCells ?? []).forEach((cell: any, c: number) => {
      const startIndex = cell?.content?.[0]?.startIndex;
      if (typeof startIndex === "number") cells.push({ rowIndex: r, colIndex: c, startIndex });
    });
  });
  return {
    tableStartIndex: last.startIndex,
    rows: tableRows.length,
    cols: tableRows[0]?.tableCells?.length ?? 0,
    cells,
  };
}
