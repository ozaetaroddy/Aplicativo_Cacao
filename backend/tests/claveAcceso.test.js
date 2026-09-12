// backend/tests/claveAcceso.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  generarClaveAcceso,
  calcularDigitoVerificador,
  descomponerClave,
  validarClave,
  validarEstructuraClave,
  formatearSerie
} = require('../utils/claveAcceso');

describe('claveAcceso', () => {
  describe('formatearSerie', () => {
    test('produce 6 dígitos', () => {
      assert.equal(formatearSerie('001', '001'), '001001');
      assert.equal(formatearSerie('1', '2'), '001002');
      assert.equal(formatearSerie(1, 1), '001001');
    });
  });

  describe('calcularDigitoVerificador', () => {
    test('devuelve dígito 0-9', () => {
      const dv = calcularDigitoVerificador('0'.repeat(48));
      assert.ok(dv >= 0 && dv <= 9, `dv=${dv}`);
    });

    test('es determinístico', () => {
      const s = '1'.repeat(48);
      assert.equal(calcularDigitoVerificador(s), calcularDigitoVerificador(s));
    });
  });

  describe('generarClaveAcceso', () => {
    test('genera 49 dígitos válidos', () => {
      const clave = generarClaveAcceso({
        fechaEmision: new Date('2024-06-15T10:00:00-05:00'),
        tipoComprobante: '01',
        ruc: '1790012344001',
        ambiente: '1',
        serie: '001001',
        secuencial: 1,
        tipoEmision: '1'
      });
      assert.equal(clave.length, 49);
      assert.match(clave, /^\d+$/);
      assert.equal(validarClave(clave), true);
    });

    test('usa hora de Ecuador (UTC-5): 22:00 EC = 03:00 UTC día siguiente', () => {
      const clave = generarClaveAcceso({
        fechaEmision: new Date('2024-06-16T03:00:00Z'),
        tipoComprobante: '01',
        ruc: '1790012344001',
        ambiente: '1',
        serie: '001001',
        secuencial: 1,
        tipoEmision: '1'
      });
      // Debe ser 15/06/2024, no 16/06/2024
      assert.equal(clave.substr(0, 8), '15062024');
    });

    test('rechaza RUC no numérico', () => {
      assert.throws(() => {
        generarClaveAcceso({
          fechaEmision: new Date(),
          tipoComprobante: '01',
          ruc: 'ABC',
          ambiente: '1',
          serie: '001001',
          secuencial: 1
        });
      });
    });

    test('rechaza ambiente inválido', () => {
      assert.throws(() => {
        generarClaveAcceso({
          fechaEmision: new Date(),
          tipoComprobante: '01',
          ruc: '1790012344001',
          ambiente: '9',
          serie: '001001',
          secuencial: 1
        });
      });
    });

    test('rechaza serie incorrecta', () => {
      assert.throws(() => {
        generarClaveAcceso({
          fechaEmision: new Date(),
          tipoComprobante: '01',
          ruc: '1790012344001',
          ambiente: '1',
          serie: '12',
          secuencial: 1
        });
      });
    });

    test('rechaza tipoEmision inválido', () => {
      assert.throws(() => {
        generarClaveAcceso({
          fechaEmision: new Date(),
          tipoComprobante: '01',
          ruc: '1790012344001',
          ambiente: '1',
          serie: '001001',
          secuencial: 1,
          tipoEmision: 'X'
        });
      });
    });
  });

  describe('descomponerClave', () => {
    test('extrae los campos correctamente', () => {
      const clave = generarClaveAcceso({
        fechaEmision: new Date('2024-06-15T10:00:00-05:00'),
        tipoComprobante: '01',
        ruc: '1790012344001',
        ambiente: '1',
        serie: '001001',
        secuencial: 42,
        tipoEmision: '1'
      });
      const partes = descomponerClave(clave);
      assert.equal(partes.ruc, '1790012344001');
      assert.equal(partes.establecimiento, '001');
      assert.equal(partes.puntoEmision, '001');
      assert.equal(partes.secuencial, '000000042');
      assert.equal(partes.tipoComprobante, '01');
      assert.equal(partes.ambienteCodigo, '1');
      assert.equal(partes.tipoEmisionCodigo, '1');
    });

    test('devuelve null con entradas inválidas', () => {
      assert.equal(descomponerClave(''), null);
      assert.equal(descomponerClave(null), null);
      assert.equal(descomponerClave('abc'), null);
      assert.equal(descomponerClave('1'.repeat(48)), null);
    });
  });

  describe('validarClave', () => {
    test('acepta clave generada', () => {
      const clave = generarClaveAcceso({
        fechaEmision: new Date(),
        tipoComprobante: '01',
        ruc: '1790012344001',
        ambiente: '1',
        serie: '001001',
        secuencial: 1
      });
      assert.equal(validarClave(clave), true);
    });

    test('rechaza si DV está mal', () => {
      const clave = generarClaveAcceso({
        fechaEmision: new Date(),
        tipoComprobante: '01',
        ruc: '1790012344001',
        ambiente: '1',
        serie: '001001',
        secuencial: 1
      });
      const dvOriginal = parseInt(clave[48], 10);
      const dvMalo = (dvOriginal + 1) % 10;
      const claveMala = clave.slice(0, 48) + dvMalo;
      assert.equal(validarClave(claveMala), false);
    });

    test('rechaza longitudes incorrectas', () => {
      assert.equal(validarClave('1'.repeat(48)), false);
      assert.equal(validarClave('1'.repeat(50)), false);
      assert.equal(validarClave(''), false);
      assert.equal(validarClave(null), false);
    });
  });

  describe('validarEstructuraClave', () => {
    test('detecta DV incorrecto sin fallar el resto', () => {
      const clave = generarClaveAcceso({
        fechaEmision: new Date(),
        tipoComprobante: '01',
        ruc: '1790012344001',
        ambiente: '1',
        serie: '001001',
        secuencial: 1
      });
      const dvOriginal = parseInt(clave[48], 10);
      const claveMala = clave.slice(0, 48) + ((dvOriginal + 1) % 10);
      const r = validarEstructuraClave(claveMala);
      assert.equal(r.valido, false);
      assert.match(r.motivo, /Dígito verificador/i);
      assert.ok(r.partes);
    });
  });
});