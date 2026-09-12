// backend/tests/xmlComprobante.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { generarXMLComprobante } = require('../utils/xmlComprobante');

const config = {
  ambiente: '1',
  tipo_emision: '1',
  razon_social: 'ACME S.A.',
  nombre_comercial: 'ACME',
  ruc: '1790012344001',
  establecimiento: '001',
  punto_emision: '001',
  direccion_matriz: 'Av. Principal 123',
  obligado_contabilidad: true
};

const cliente = {
  ruc: '1710034065',
  nombre: 'JUAN PÉREZ',
  email: 'juan@example.com',
  telefono: '0991234567',
  direccion: 'Calle Falsa 123'
};

function facturaBase(overrides = {}) {
  return {
    tipo_documento: 'factura',
    numero_factura: 'FAC-000001',
    fecha_emision: new Date('2024-06-15T10:00:00-05:00'),
    clave_acceso: '1'.repeat(49),
    secuencial_sri: '000000001',
    detalles: [
      { productoId: 'p1', cantidad: 2, precio_unitario: 10, aplica_iva: true, tarifa_iva: 15 }
    ],
    subtotal: 20,
    iva: 3,
    total: 23,
    forma_pago: '01',
    ...overrides
  };
}

describe('xmlComprobante', () => {
  describe('factura', () => {
    test('genera XML con tags esperados', () => {
      const xml = generarXMLComprobante(facturaBase(), cliente, config);
      assert.match(xml, /<factura id="comprobante" version="1\.1\.0">/);
      assert.match(xml, /<ruc>1790012344001<\/ruc>/);
      assert.match(xml, /<importeTotal>23\.00<\/importeTotal>/);
      assert.match(xml, /<identificacionComprador>1710034065<\/identificacionComprador>/);
      assert.match(xml, /<fechaEmision>15\/06\/2024<\/fechaEmision>/);
      assert.match(xml, /<secuencial>000000001<\/secuencial>/);
    });

    test('escapa caracteres peligrosos', () => {
      const venta = facturaBase({
        detalles: [{
          productoId: 'x',
          cantidad: 1,
          precio_unitario: 1,
          aplica_iva: false,
          nombre: '<script>alert("xss")</script>',
          codigo: 'A&B'
        }],
        subtotal: 1,
        iva: 0,
        total: 1
      });
      const xml = generarXMLComprobante(venta, cliente, config);
      assert.doesNotMatch(xml, /<script>/);
      assert.match(xml, /&lt;script&gt;/);
      assert.match(xml, /A&amp;B/);
    });

    test('agrupa IVA por tarifa', () => {
      const venta = facturaBase({
        detalles: [
          { productoId: 'p1', cantidad: 1, precio_unitario: 100, aplica_iva: true, tarifa_iva: 15 },
          { productoId: 'p2', cantidad: 1, precio_unitario: 50, aplica_iva: false }
        ],
        subtotal: 150,
        iva: 15,
        total: 165
      });
      const xml = generarXMLComprobante(venta, cliente, config);
      // Debe haber 2 <totalImpuesto>
      const matches = xml.match(/<totalImpuesto>/g) || [];
      assert.equal(matches.length, 2);
    });
  });

  describe('nota de crédito', () => {
    test('incluye referencia al documento modificado', () => {
      const nc = facturaBase({
        tipo_documento: 'nota_credito',
        numero_factura_modificada: 'FAC-000100',
        motivo: 'DEVOLUCION',
        numero_factura: 'NCR-000001'
      });
      const xml = generarXMLComprobante(nc, cliente, config);
      assert.match(xml, /<notaCredito id="comprobante" version="1\.1\.0">/);
      assert.match(xml, /<numDocModificado>FAC-000100<\/numDocModificado>/);
      assert.match(xml, /<motivo>DEVOLUCION<\/motivo>/);
    });
  });

  describe('retención', () => {
    test('incluye codDocSustento por cada impuesto', () => {
      const ret = {
        tipo_documento: 'retencion',
        fecha_emision: new Date('2024-06-15T10:00:00-05:00'),
        clave_acceso: '1'.repeat(49),
        secuencial_sri: '000000001',
        establecimiento: '001',
        punto_emision: '001',
        detalles: [],
        subtotal: 100,
        impuestos_retencion: [
          {
            codigo: '1',
            codigoRetencion: '312',
            baseImponible: 100,
            porcentajeRetener: 2,
            valorRetenido: 2,
            codDocSustento: '01',
            numDocSustento: '001001000000123',
            fechaEmisionDocSustento: '15/06/2024'
          }
        ]
      };
      const xml = generarXMLComprobante(ret, cliente, config);
      assert.match(xml, /<comprobanteRetencion id="comprobante" version="1\.0\.0">/);
      assert.match(xml, /<codDocSustento>01<\/codDocSustento>/);
      assert.match(xml, /<numDocSustento>001001000000123<\/numDocSustento>/);
      assert.match(xml, /<codigoRetencion>312<\/codigoRetencion>/);
      assert.match(xml, /<valorRetenido>2\.00<\/valorRetenido>/);
    });

    test('usa defaults si no se especifica codDocSustento', () => {
      const ret = {
        tipo_documento: 'retencion',
        fecha_emision: new Date('2024-06-15T10:00:00-05:00'),
        clave_acceso: '1'.repeat(49),
        secuencial_sri: '000000001',
        detalles: [],
        subtotal: 100,
        comprobante_documento: '01',
        comprobante_numero: '001001000000999',
        impuestos_retencion: [
          { codigo: '1', codigoRetencion: '312', baseImponible: 100, porcentajeRetener: 2, valorRetenido: 2 }
        ]
      };
      const xml = generarXMLComprobante(ret, cliente, config);
      assert.match(xml, /<numDocSustento>001001000000999<\/numDocSustento>/);
    });
  });

  describe('guía de remisión', () => {
    test('genera estructura básica', () => {
      const guia = {
        tipo_documento: 'guia_remision',
        fecha_emision: new Date('2024-06-15T10:00:00-05:00'),
        clave_acceso: '1'.repeat(49),
        secuencial_sri: '000000001',
        detalles: [{ productoId: 'p1', cantidad: 5, nombre: 'Caja' }],
        direccion_partida: 'Bodega Central',
        transportista_razon_social: 'TRANSPORTES XYZ',
        transportista_identificacion: '1790012344001',
        placa_transporte: 'ABC-1234',
        motivo: 'VENTA',
        destinatario_identificacion: '1710034065',
        destinatario_razon_social: 'JUAN PÉREZ'
      };
      const xml = generarXMLComprobante(guia, cliente, config);
      assert.match(xml, /<guiaRemision id="comprobante" version="1\.1\.0">/);
      assert.match(xml, /<placa>ABC-1234<\/placa>/);
      assert.match(xml, /<motivoTraslado>VENTA<\/motivoTraslado>/);
    });
  });
});