import * as XLSX from 'xlsx';
import { entryAt, GROUP_LABEL, GROUPS, type Comparison, type Group } from './compare';

function sheet(c: Comparison, g: Group) {
  const aoa: (string | number)[][] = [['Giá trị', 'Số lần ở A', 'Số lần ở B', 'Dòng ở A', 'Dòng ở B']];
  for (let i = 0; i < c[g].length; i++) {
    const e = entryAt(c, g, i);
    aoa.push([e.value, e.countA, e.countB, e.rowsA.join(', '), e.rowsB.join(', ')]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { dense: true });
  ws['!cols'] = [{ wch: 36 }, { wch: 11 }, { wch: 11 }, { wch: 24 }, { wch: 24 }];
  return ws;
}

/** One .xlsx: a summary sheet, then one sheet per group. Built in the worker, only when asked for. */
export function buildCompareXlsx(c: Comparison, nameA: string, nameB: string): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ['File A', nameA],
    ['File B', nameB],
    [],
    ...GROUPS.map((g) => [GROUP_LABEL[g], c[g].length]),
    ['Ô trống ở A', c.a.empty],
    ['Ô trống ở B', c.b.empty],
  ]);
  summary['!cols'] = [{ wch: 16 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Tổng quan');
  for (const g of GROUPS) XLSX.utils.book_append_sheet(wb, sheet(c, g), GROUP_LABEL[g]);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true });
}
