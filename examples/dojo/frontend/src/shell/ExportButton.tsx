import { Button } from "@chakra-ui/react";
import { LuDownload } from "react-icons/lu";
import { pageQuery, type PageParams } from "@jwcarman/roux-web/paging";

/**
 * The export URL for a list: its search, filters and sort, without paging, so the file holds what
 * the list shows, every page of it.
 */
export function exportHref(path: string, params: PageParams & Record<string, string | number | undefined>): string {
  const { pageIndex: _pageIndex, pageSize: _pageSize, ...unpaged } = params;
  return `${path}${pageQuery(unpaged)}`;
}

/** A download link styled as a button; the browser saves what the server sends. */
export function ExportButton({ href, label = "Export" }: { href: string; label?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download>
        <LuDownload aria-hidden />
        {label}
      </a>
    </Button>
  );
}
