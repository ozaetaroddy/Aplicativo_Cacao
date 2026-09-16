// backend/tests/tiposDocumento.test.js
// ============================================================
// Tests para utils/tiposDocumento.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  TIPOS_NO_COMERCIALES,
  TIPOS_NO_CXC,
  TIPOS_NO_DEUDA,
  TIPOS_VENTA_NO_ATS,
  TIPOS_SIN_MOVIMIENTO_STOCK,
  TIPOS_DOCUMENTO_VALIDOS,
  DOCS_CON_CLAVE,
  TIPO_COMPROBANTE_SRI,
  PREFIJOS_CONTADOR,
  matchSoloVentasComerciales,
  matchVentasNetas,
  SETS,
  DESCRIPCIONES_TIPO,
  normalizarTipo,
  esTipoValido,
  esComercial,
  esCuentaPorCobrar,
  aplicaATS,
  afectaStock,
  requiereClaveAcceso,
  getCodigoSRI,
  getPrefijo,
  getDescripcion,
  CONFIG,
  _NO_COMERCIALES_BASE
} = require('../utils/tiposDocumento');

// ============================================================
// LISTAS Y CONSTANTES
// ============================================================
describe('tiposDocumento · listas', () => {
  test('TIPOS_NO_COMERCIALES contiene los 3 esperados', () => {
    assert.deepEqual(
      [...TIPOS_NO_COMERCIALES].sort(),
      ['guia_remision', 'proforma', 'retencion']
    );
  });

  test('TIPOS_NO_CXC es igual a TIPOS_NO_COMERCIALES', () => {
    assert.equal(TIPOS_NO_CXC, TIPOS_NO_COMERCIALES);
  });

  test('TIPOS_NO_DEUDA es alias', () => {
    assert.equal(TIPOS_NO_DEUDA, TIPOS_NO_CXC);
  });

  test('TIPOS_VENTA_NO_ATS es igual', () => {
    assert.equal(TIPOS_VENTA_NO_ATS, TIPOS_NO_COMERCIALES);
  });

  test('_NO_COMERCIALES_BASE es la fuente única', () => {
    assert.equal(_NO_COMERCIALES_BASE, TIPOS_NO_COMERCIALES);
  });

  test('todas las listas están congeladas', () => {
    assert.equal(Object.isFrozen(TIPOS_NO_COMERCIALES), true);
    assert.equal(Object.isFrozen(TIPOS_NO_CXC), true);
    assert.equal(Object.isFrozen(TIPOS_VENTA_NO_ATS), true);
    assert.equal(Object.isFrozen(TIPOS_SIN_MOVIMIENTO_STOCK), true);
    assert.equal(Object.isFrozen(DOCS_CON_CLAVE), true);
    assert.equal(Object.isFrozen(TIPOS_DOCUMENTO_VALIDOS), true);
    assert.equal(Object.isFrozen(TIPO_COMPROBANTE_SRI), true);
    assert.equal(Object.isFrozen(PREFIJOS_CONTADOR), true);
    assert.equal(Object.isFrozen(DESCRIPCIONES_TIPO), true);
  });

  test('no se pueden mutar las listas', () => {
    assert.throws(() => { TIPOS_NO_COMERCIALES.push('hack'); }, TypeError);
    assert.throws(() => { TIPO_COMPROBANTE_SRI.factura = '99'; }, TypeError);
  });

  test('DOCS_CON_CLAVE incluye todos los que requieren clave', () => {
    for (const t of ['factura', 'liquidacion', 'nota_credito', 'nota_debito',
                     'guia_remision', 'retencion', 'exportacion', 'reembolso']) {
      assert.ok(DOCS_CON_CLAVE.includes(t), `falta ${t}`);
    }
  });

  test('TIPOS_DOCUMENTO_VALIDOS incluye proforma', () => {
    assert.ok(TIPOS_DOCUMENTO_VALIDOS.includes('proforma'));
  });

  test('TIPOS_SIN_MOVIMIENTO_STOCK NO incluye factura', () => {
    assert.ok(!TIPOS_SIN_MOVIMIENTO_STOCK.includes('factura'));
  });

  test('TIPOS_SIN_MOVIMIENTO_STOCK incluye nota_debito', () => {
    assert.ok(TIPOS_SIN_MOVIMIENTO_STOCK.includes('nota_debito'));
  });

  test('TIPOS_SIN_MOVIMIENTO_STOCK NO incluye nota_credito', () => {
    assert.ok(!TIPOS_SIN_MOVIMIENTO_STOCK.includes('nota_credito'));
  });
});

// ============================================================
// SETS
// ============================================================
describe('tiposDocumento · SETS', () => {
  test('cada SET corresponde a su array', () => {
    for (const t of TIPOS_NO_COMERCIALES) {
      assert.ok(SETS.TIPOS_NO_COMERCIALES.has(t));
    }
    for (const t of DOCS_CON_CLAVE) {
      assert.ok(SETS.DOCS_CON_CLAVE.has(t));
    }
    for (const t of TIPOS_DOCUMENTO_VALIDOS) {
      assert.ok(SETS.TIPOS_DOCUMENTO_VALIDOS.has(t));
    }
  });

  test('todos los Sets están congelados', () => {
    for (const s of Object.values(SETS)) {
      assert.equal(Object.isFrozen(s), true);
    }
  });

  test('SETS.TIPOS_NO_CXC es igual a SETS.TIPOS_NO_COMERCIALES', () => {
    // Mismos elementos
    for (const t of SETS.TIPOS_NO_CXC) {
      assert.ok(SETS.TIPOS_NO_COMERCIALES.has(t));
    }
  });
});

// ============================================================
// normalizarTipo
// ============================================================
describe('tiposDocumento · normalizarTipo', () => {
  test('lowercase + trim', () => {
    assert.equal(normalizarTipo('  Factura  '), 'factura');
    assert.equal(normalizarTipo('NOTA_CREDITO'), 'nota_credito');
  });

  test('no-string → null', () => {
    assert.equal(normalizarTipo(null), null);
    assert.equal(normalizarTipo(undefined), null);
    assert.equal(normalizarTipo(42), null);
    assert.equal(normalizarTipo({}), null);
  });

  test('vacío → null', () => {
    assert.equal(normalizarTipo(''), null);
    assert.equal(normalizarTipo('   '), null);
  });
});

// ============================================================
// esTipoValido
// ============================================================
describe('tiposDocumento · esTipoValido', () => {
  test('todos los válidos', () => {
    for (const t of TIPOS_DOCUMENTO_VALIDOS) {
      assert.equal(esTipoValido(t), true, t);
    }
  });

  test('normaliza antes de comparar', () => {
    assert.equal(esTipoValido('Factura'), true);
    assert.equal(esTipoValido('  FACTURA  '), true);
  });

  test('rechaza no-strings y vacíos', () => {
    assert.equal(esTipoValido(null), false);
    assert.equal(esTipoValido(undefined), false);
    assert.equal(esTipoValido(''), false);
    assert.equal(esTipoValido(42), false);
  });

  test('rechaza tipos desconocidos', () => {
    assert.equal(esTipoValido('desconocido'), false);
    assert.equal(esTipoValido('compra'), false); // no está en validos de venta
  });
});

// ============================================================
// esComercial / esCuentaPorCobrar / aplicaATS
// ============================================================
describe('tiposDocumento · esComercial', () => {
  test('factura SÍ es comercial', () => {
    assert.equal(esComercial('factura'), true);
  });

  test('guía NO es comercial', () => {
    assert.equal(esComercial('guia_remision'), false);
    assert.equal(esComercial('proforma'), false);
    assert.equal(esComercial('retencion'), false);
  });

  test('nota_credito SÍ es comercial (pero resta)', () => {
    assert.equal(esComercial('nota_credito'), true);
  });

  test('no reconocido → false', () => {
    assert.equal(esComercial('desconocido'), false);
    assert.equal(esComercial(null), false);
  });

  test('esCuentaPorCobrar = esComercial', () => {
    for (const t of TIPOS_DOCUMENTO_VALIDOS) {
      assert.equal(esCuentaPorCobrar(t), esComercial(t), t);
    }
  });

  test('aplicaATS = esComercial', () => {
    for (const t of TIPOS_DOCUMENTO_VALIDOS) {
      assert.equal(aplicaATS(t), esComercial(t), t);
    }
  });
});

// ============================================================
// afectaStock
// ============================================================
describe('tiposDocumento · afectaStock', () => {
  test('factura SÍ afecta stock', () => {
    assert.equal(afectaStock('factura'), true);
  });

  test('guía NO afecta stock', () => {
    assert.equal(afectaStock('guia_remision'), false);
  });

  test('proforma NO afecta stock', () => {
    assert.equal(afectaStock('proforma'), false);
  });

  test('retencion NO afecta stock', () => {
    assert.equal(afectaStock('retencion'), false);
  });

  test('nota_debito NO afecta stock', () => {
    assert.equal(afectaStock('nota_debito'), false);
  });

  test('nota_credito SÍ afecta stock (devolución)', () => {
    assert.equal(afectaStock('nota_credito'), true);
  });

  test('null/no-string → false (no asumir)', () => {
    assert.equal(afectaStock(null), false);
    assert.equal(afectaStock(undefined), false);
  });
});

// ============================================================
// requiereClaveAcceso
// ============================================================
describe('tiposDocumento · requiereClaveAcceso', () => {
  test('factura SÍ requiere', () => {
    assert.equal(requiereClaveAcceso('factura'), true);
  });

  test('proforma NO requiere', () => {
    assert.equal(requiereClaveAcceso('proforma'), false);
  });

  test('guia_remision SÍ requiere', () => {
    assert.equal(requiereClaveAcceso('guia_remision'), true);
  });

  test('normaliza antes', () => {
    assert.equal(requiereClaveAcceso('  Factura  '), true);
  });

  test('null → false', () => {
    assert.equal(requiereClaveAcceso(null), false);
  });
});

// ============================================================
// getCodigoSRI / getPrefijo / getDescripcion
// ============================================================
describe('tiposDocumento · getCodigoSRI', () => {
  test('factura → 01', () => {
    assert.equal(getCodigoSRI('factura'), '01');
  });

  test('nota_credito → 04', () => {
    assert.equal(getCodigoSRI('nota_credito'), '04');
  });

  test('retencion → 07', () => {
    assert.equal(getCodigoSRI('retencion'), '07');
  });

  test('proforma → null', () => {
    assert.equal(getCodigoSRI('proforma'), null);
  });

  test('desconocido → null', () => {
    assert.equal(getCodigoSRI('xxx'), null);
  });

  test('null → null', () => {
    assert.equal(getCodigoSRI(null), null);
  });
});

describe('tiposDocumento · getPrefijo', () => {
  test('factura → FAC', () => {
    assert.equal(getPrefijo('factura'), 'FAC');
  });

  test('guia_remision → GUI', () => {
    assert.equal(getPrefijo('guia_remision'), 'GUI');
  });

  test('compra → COM', () => {
    assert.equal(getPrefijo('compra'), 'COM');
  });

  test('desconocido → null', () => {
    assert.equal(getPrefijo('xxx'), null);
  });

  test('null → null', () => {
    assert.equal(getPrefijo(null), null);
  });
});

describe('tiposDocumento · getDescripcion', () => {
  test('factura → Factura', () => {
    assert.equal(getDescripcion('factura'), 'Factura');
  });

  test('nota_credito → Nota de Crédito', () => {
    assert.equal(getDescripcion('nota_credito'), 'Nota de Crédito');
  });

  test('case-insensitive', () => {
    assert.equal(getDescripcion('FACTURA'), 'Factura');
  });

  test('desconocido → el tipo tal cual', () => {
    assert.equal(getDescripcion('raro'), 'raro');
  });

  test('null → Desconocido', () => {
    assert.equal(getDescripcion(null), 'Desconocido');
  });
});

// ============================================================
// matchSoloVentasComerciales / matchVentasNetas
// ============================================================
describe('tiposDocumento · matches Mongo', () => {
  test('matchSoloVentasComerciales devuelve $nin con los 3', () => {
    const m = matchSoloVentasComerciales();
    assert.ok(m.tipo_documento);
    assert.ok(Array.isArray(m.tipo_documento.$nin));
    assert.equal(m.tipo_documento.$nin.length, TIPOS_NO_COMERCIALES.length);
    for (const t of TIPOS_NO_COMERCIALES) {
      assert.ok(m.tipo_documento.$nin.includes(t));
    }
  });

  test('matchVentasNetas incluye nota_credito en $nin', () => {
    const m = matchVentasNetas();
    assert.ok(m.tipo_documento.$nin.includes('nota_credito'));
  });

  test('matchVentasNetas excluye TODO lo de comerciales + nota_credito', () => {
    const m = matchVentasNetas();
    const esperados = new Set([...TIPOS_NO_COMERCIALES, 'nota_credito']);
    for (const t of esperados) {
      assert.ok(m.tipo_documento.$nin.includes(t));
    }
  });

  test('usar el array NO muta la lista original', () => {
    const antes = TIPOS_NO_COMERCIALES.length;
    matchSoloVentasComerciales();
    matchVentasNetas();
    assert.equal(TIPOS_NO_COMERCIALES.length, antes);
  });

  test('dos llamadas devuelven objetos distintos', () => {
    const m1 = matchVentasNetas();
    const m2 = matchVentasNetas();
    assert.notEqual(m1, m2);           // objeto wrapper distinto
    assert.notEqual(m1.tipo_documento, m2.tipo_documento);
    // Pero con mismo contenido
    assert.deepEqual(m1, m2);
  });
});

// ============================================================
// CONFIG
// ============================================================
describe('tiposDocumento · CONFIG', () => {
  test('expone las 3 listas clave', () => {
    assert.equal(CONFIG.tiposDocumento, TIPOS_DOCUMENTO_VALIDOS);
    assert.equal(CONFIG.docsConClave, DOCS_CON_CLAVE);
    assert.equal(CONFIG.noComerciales, TIPOS_NO_COMERCIALES);
  });

  test('CONFIG está congelado', () => {
    assert.equal(Object.isFrozen(CONFIG), true);
  });
});