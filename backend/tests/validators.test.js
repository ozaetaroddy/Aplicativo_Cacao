// backend/tests/validators.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  validarCedula,
  validarRUC,
  validarIdentificacion,
  validarTelefono,
  validarEmail,
  validarPlaca,
  validarCodigoPostal
} = require('../utils/validators');

describe('validators', () => {
  describe('validarCedula', () => {
    test('acepta cédulas válidas', () => {
      // Cédula conocida válida (provincia 17, tercer dígito < 6)
      assert.equal(validarCedula('1710034065'), true);
    });

    test('rechaza cédulas con DV incorrecto', () => {
      assert.equal(validarCedula('1710034066'), false);
    });

    test('rechaza longitud incorrecta', () => {
      assert.equal(validarCedula('171003406'), false);
      assert.equal(validarCedula('17100340651'), false);
      assert.equal(validarCedula(''), false);
      assert.equal(validarCedula(null), false);
    });

    test('rechaza provincia fuera de rango', () => {
      assert.equal(validarCedula('0010034065'), false);
      assert.equal(validarCedula('2510034065'), false);
    });

    test('rechaza tercer dígito >= 6', () => {
      // Provincia 17 con tercer dígito 6 (debería ser rechazado)
      assert.equal(validarCedula('1760000000'), false);
    });
  });

  describe('validarRUC', () => {
    test('acepta RUC persona natural válido', () => {
      // 1710034065 + 001
      assert.equal(validarRUC('1710034065001'), true);
    });

    test('acepta RUC sociedad privada válido', () => {
      // RUC generado con módulo 11 para tercer dígito 9
      assert.equal(validarRUC('1790012344001'), true);
    });

    test('rechaza RUC sin 001 final', () => {
      assert.equal(validarRUC('1790012344002'), false);
    });

    test('rechaza RUC con DV incorrecto', () => {
      assert.equal(validarRUC('1790012345001'), false);
    });

    test('rechaza longitudes incorrectas', () => {
      assert.equal(validarRUC('179001234400'), false);
      assert.equal(validarRUC('17900123440012'), false);
    });
  });

  describe('validarIdentificacion', () => {
    test('acepta cédula y devuelve tipo CEDULA', () => {
      const r = validarIdentificacion('1710034065');
      assert.equal(r.valido, true);
      assert.equal(r.tipo, 'CEDULA');
    });

    test('acepta RUC y devuelve tipo RUC', () => {
      const r = validarIdentificacion('1790012344001');
      assert.equal(r.valido, true);
      assert.equal(r.tipo, 'RUC');
    });

    test('rechaza cadenas muy cortas', () => {
      const r = validarIdentificacion('123');
      assert.equal(r.valido, false);
      assert.match(r.mensaje, /10|13/);
    });

    test('rechaza cadenas muy largas', () => {
      const r = validarIdentificacion('1'.repeat(15));
      assert.equal(r.valido, false);
    });

    test('rechaza vacío', () => {
      assert.equal(validarIdentificacion('').valido, false);
      assert.equal(validarIdentificacion(null).valido, false);
    });
  });

  describe('validarTelefono', () => {
    test('acepta celular 09XXXXXXXX', () => {
      assert.equal(validarTelefono('0991234567').valido, true);
      assert.equal(validarTelefono('0991234567').tipo, 'CELULAR');
    });

    test('acepta fijo 0XXXXXXXXX', () => {
      assert.equal(validarTelefono('022123456').valido, true);
      assert.equal(validarTelefono('022123456').tipo, 'FIJO');
    });

    test('rechaza formatos inválidos', () => {
      assert.equal(validarTelefono('1234567890').valido, false);
      assert.equal(validarTelefono('+593991234567').valido, false);
      assert.equal(validarTelefono('').valido, false);
    });
  });

  describe('validarEmail', () => {
    test('acepta emails válidos', () => {
      assert.equal(validarEmail('test@example.com').valido, true);
      assert.equal(validarEmail('user.name+tag@sub.domain.io').valido, true);
    });

    test('rechaza emails sin formato correcto', () => {
      assert.equal(validarEmail('notanemail').valido, false);
      assert.equal(validarEmail('@example.com').valido, false);
      assert.equal(validarEmail('user@').valido, false);
      assert.equal(validarEmail('').valido, false);
    });
  });

  describe('validarPlaca', () => {
    test('acepta placas ecuatorianas', () => {
      assert.equal(validarPlaca('ABC-1234').valido, true);
      assert.equal(validarPlaca('ABC123').valido, true);
      assert.equal(validarPlaca('AB-1234').valido, true);
    });

    test('rechaza placas inválidas', () => {
      assert.equal(validarPlaca('123').valido, false);
      assert.equal(validarPlaca('').valido, false);
    });
  });

  describe('validarCodigoPostal', () => {
    test('acepta 6 dígitos', () => {
      assert.equal(validarCodigoPostal('170150').valido, true);
    });

    test('rechaza longitudes incorrectas', () => {
      assert.equal(validarCodigoPostal('12345').valido, false);
      assert.equal(validarCodigoPostal('1234567').valido, false);
    });
  });
});