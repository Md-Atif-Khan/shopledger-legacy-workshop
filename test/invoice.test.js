var test = require('node:test');
var assert = require('node:assert/strict');
var invoice = require('../lib/invoice');
var pricing = require('../lib/pricing');
var reports = require('../lib/reports');

function order(id, items, coupon, ledgerFigures) {
  return Object.assign({
    id: id,
    date: '2026-11-15',
    customer: 'In-memory customer',
    items: items,
    coupon: coupon || ''
  }, ledgerFigures || {});
}

test('CURRENT BEHAVIOUR: invoice ignores HSN slabs and prices items at the default 18% rate', function () {
  var items = [
    { id: 1, name: 'Rice', sku: 'RICE', hsn: '1006', price: 100, qty: 1 },
    { id: 2, name: 'Ghee', sku: 'GHEE', hsn: '0405', price: 100, qty: 1 }
  ];

  var ledger = pricing.computeTotals(items, '');
  var calc = invoice.computeInvoiceFigures(order(1001, items));

  assert.equal(ledger.tax, 17);
  assert.equal(ledger.total, 217);
  assert.equal(calc.tax, 36);
  assert.equal(calc.total, 236);
  assert.deepEqual(calc.rows.map(function (row) { return row.gstPercent; }), [18, 18]);
});

test('CURRENT BEHAVIOUR: invoice applies SAVE10 to subtotal plus GST without the coupon cap', function () {
  var items = [{ id: 1, name: 'Bulk goods', hsn: '0902', price: 2240, qty: 1 }];
  var ledger = pricing.computeTotals(items, 'SAVE10');
  var calc = invoice.computeInvoiceFigures(order(1004, items, 'SAVE10'));

  assert.equal(ledger.discount, 150);
  assert.equal(ledger.tax, 376.2);
  assert.equal(ledger.total, 2466.2);
  assert.equal(calc.discount, 264.32);
  assert.equal(calc.tax, 403.2);
  assert.equal(calc.total, 2378.88);
});

test('CURRENT BEHAVIOUR: invoice applies a coupon even when its minimum-spend rules would reject it', function () {
  var items = [{ id: 1, name: 'Small purchase', hsn: '0902', price: 100, qty: 1 }];
  var ledger = pricing.computeTotals(items, 'SAVE10');
  var calc = invoice.computeInvoiceFigures(order(1002, items, 'SAVE10'));

  assert.equal(ledger.discount, 0);
  assert.equal(calc.discount, 11.8);
  assert.equal(calc.total, 106.2);
});

test('CURRENT BEHAVIOUR: all-18% items without a coupon produce matching invoice and ledger figures', function () {
  var items = [{ id: 1, name: 'Tea', hsn: '0902', price: 500, qty: 2 }];
  var ledger = pricing.computeTotals(items, '');
  var calc = invoice.computeInvoiceFigures(order(1008, items));

  assert.equal(ledger.tax, 180);
  assert.equal(calc.tax, 180);
  assert.equal(ledger.total, 1180);
  assert.equal(calc.total, 1180);
});

test('CURRENT BEHAVIOUR: reconciliation reports the invoice calculation differences for in-memory orders', function () {
  var items = [{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }];
  var ledger = pricing.computeTotals(items, '');
  var reconciliation = reports.getGstReconciliation({
    orders: [order(1001, items, '', {
      subtotal: ledger.subtotal,
      discount: ledger.discount,
      tax: ledger.tax,
      total: ledger.total
    })]
  });

  assert.equal(reconciliation.totalChecked, 1);
  assert.equal(reconciliation.mismatchCount, 1);
  assert.equal(reconciliation.rows[0].ledgerTax, 5);
  assert.equal(reconciliation.rows[0].invoiceTax, 18);
  assert.equal(reconciliation.rows[0].delta, 13);
});
