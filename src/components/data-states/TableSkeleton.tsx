import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}

/**
 * Renders a skeleton table that approximates the dimensions of a real list
 * while data is loading. Use inside the same Card/border container as the
 * real table to avoid layout shift.
 */
export function TableSkeleton({
  rows = 8,
  columns = 6,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  return (
    <Table className={className}>
      {showHeader && (
        <TableHeader>
          <TableRow>
            {Array.from({ length: columns }).map((_, i) => (
              <TableHead key={i}>
                <Skeleton className="h-4 w-20" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {Array.from({ length: columns }).map((__, c) => (
              <TableCell key={c}>
                <Skeleton className="h-4" style={{ width: `${50 + ((r + c) % 5) * 10}%` }} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}