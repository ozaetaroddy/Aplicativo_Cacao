// backend/tests/validators.test.js
// ============================================================
// Tests para utils/validators.js
// ============================================================
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  validarCedula,
  validarRUC,
  validarIdentificacion,
  validarTelefono,
  validarEmail,
  validarPlaca,
  validarCodigoPostal,
  validarSecuencial,
  validarLogoUrl,
  validarPasaporte,
  validarCodigoNumerico,
  normalizarIdentificacion,
  soloDigitos,
  trimUpper,
  esStringNoVacio,
  CONFIG,
  _validarModulo11,
  _provinciaValida,
  _tieneControlChars,
  _PROVINCIAS_EC
} = require('../utils/validators');

// ============================================================
// Tests originales (sin cambios)
// ============================================================
describe('validators · validarCedula', () => {
  test('acepta cédulas válidas', () => {
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
    assert.equal(validarCedula('1760000000'), false);
  });
});

describe('validators · validarRUC', () => {
  test('acepta RUC persona natural válido', () => {
    assert.equal(validarRUC('1710034065001'), true);
  });

  test('acepta RUC sociedad privada válido', () => {
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

describe('validators · validarIdentificacion', () => {
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

describe('validators · validarTelefono', () => {
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

describe('validators · validarEmail', () => {
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

describe('validators · validarPlaca', () => {
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

describe('validators · validarCodigoPostal', () => {
  test('acepta 6 dígitos', () => {
    assert.equal(validarCodigoPostal('170150').valido, true);
  });

  test('rechaza longitudes incorrectas', () => {
    assert.equal(validarCodigoPostal('12345').valido, false);
    assert.equal(validarCodigoPostal('1234567').valido, false);
  });
});

// ============================================================
// TESTS NUEVOS
// ============================================================

// ============================================================
// CONFIG
// ============================================================
describe('validators · CONFIG', () => {
  test('valores por defecto sensatos', () => {
    assert.ok(CONFIG.maxLogoLen > 0);
    assert.ok(CONFIG.emailMaxLen > 0);
    assert.equal(typeof CONFIG.permitirSvgLogo, 'boolean');
  });

  test('provinciasEcuador tiene 24 entradas', () => {
    assert.equal(CONFIG.provinciasEcuador.size, 24);
  });

  test('CONFIG está congelado', () => {
    assert.equal(Object.isFrozen(CONFIG), true);
  });
});

// ============================================================
// HELPERS
// ============================================================
describe('validators · soloDigitos', () => {
  test('extrae solo dígitos', () => {
    assert.equal(soloDigitos('17-100-340-65'), '1710034065');
    assert.equal(soloDigitos('abc123def'), '123');
    assert.equal(soloDigitos('+593 99 123 4567'), '593991234567');
  });

  test('null/undefined → ""', () => {
    assert.equal(soloDigitos(null), '');
    assert.equal(soloDigitos(undefined), '');
  });

  test('sin dígitos → ""', () => {
    assert.equal(soloDigitos('abc'), '');
  });
});

describe('validators · trimUpper', () => {
  test('trim + uppercase', () => {
    assert.equal(trimUpper('  abc  '), 'ABC');
    assert.equal(trimUpper('Hola'), 'HOLA');
  });

  test('null/undefined → ""', () => {
    assert.equal(trimUpper(null), '');
    assert.equal(trimUpper(undefined), '');
  });
});

describe('validators · esStringNoVacio', () => {
  test('strings válidos', () => {
    assert.equal(esStringNoVacio('x'), true);
    assert.equal(esStringNoVacio('  x  '), true);
  });

  test('no-strings o vacíos', () => {
    assert.equal(esStringNoVacio(''), false);
    assert.equal(esStringNoVacio('   '), false);
    assert.equal(esStringNoVacio(null), false);
    assert.equal(esStringNoVacio(42), false);
  });
});

describe('validators · _tieneControlChars', () => {
  test('detecta CR, LF, TAB, null', () => {
    assert.equal(_tieneControlChars('a\rb'), true);
    assert.equal(_tieneControlChars('a\nb'), true);
    assert.equal(_tieneControlChars('a\tb'), true);
    assert.equal(_tieneControlChars('a\x00b'), true);
  });

  test('strings limpios → false', () => {
    assert.equal(_tieneControlChars('abc'), false);
    assert.equal(_tieneControlChars('áéí'), false);
  });

  test('no-strings → false', () => {
    assert.equal(_tieneControlChars(null), false);
    assert.equal(_tieneControlChars(42), false);
  });
});

// ============================================================
// PASAPORTE
// ============================================================
describe('validators · validarPasaporte', () => {
  test('acepta pasaportes válidos', () => {
    assert.equal(validarPasaporte('AB123456').valido, true);
    assert.equal(validarPasaporte('123456789').valido, true);
    assert.equal(validarPasaporte('ABCDE12345').valido, true);
  });

  test('normaliza trim/upper', () => {
    assert.equal(validarPasaporte('  ab1234  ').valido, true);
  });

  test('rechaza muy corto o muy largo', () => {
    assert.equal(validarPasaporte('AB12').valido, false);
    assert.equal(validarPasaporte('A'.repeat(25)).valido, false);
  });

  test('rechaza caracteres no alfanuméricos', () => {
    assert.equal(validarPasaporte('AB-1234').valido, false);
    assert.equal(validarPasaporte('AB 123').valido, false);
  });

  test('vacío → error', () => {
    assert.equal(validarPasaporte('').valido, false);
    assert.equal(validarPasaporte(null).valido, false);
  });
});

// ============================================================
// CÓDIGO NUMÉRICO
// ============================================================
describe('validators · validarCodigoNumerico', () => {
  test('acepta 8 dígitos', () => {
    assert.equal(validarCodigoNumerico('12345678').valido, true);
    assert.equal(validarCodigoNumerico('00000001').valido, true);
  });

  test('rechaza longitudes incorrectas', () => {
    assert.equal(validarCodigoNumerico('1234567').valido, false);
    assert.equal(validarCodigoNumerico('123456789').valido, false);
  });

  test('vacío → error', () => {
    assert.equal(validarCodigoNumerico('').valido, false);
    assert.equal(validarCodigoNumerico(null).valido, false);
  });
});

// ============================================================
// normalizarIdentificacion
// ============================================================
describe('validators · normalizarIdentificacion', () => {
  test('cédula válida', () => {
    const r = normalizarIdentificacion('1710034065');
    assert.equal(r.limpio, '1710034065');
    assert.equal(r.tipo, 'CEDULA');
    assert.equal(r.valido, true);
  });

  test('RUC válido', () => {
    const r = normalizarIdentificacion('1790012344001');
    assert.equal(r.tipo, 'RUC');
    assert.equal(r.valido, true);
  });

  test('con formato (guiones)', () => {
    const r = normalizarIdentificacion('17-100-340-65');
    assert.equal(r.limpio, '1710034065');
    assert.equal(r.tipo, 'CEDULA');
    assert.equal(r.valido, true);
  });

  test('longitud incorrecta → tipo null', () => {
    const r = normalizarIdentificacion('123');
    assert.equal(r.limpio, '123');
    assert.equal(r.tipo, null);
    assert.equal(r.valido, false);
  });

  test('null → limpio=""', () => {
    const r = normalizarIdentificacion(null);
    assert.equal(r.limpio, '');
    assert.equal(r.tipo, null);
  });
});

// ============================================================
// SECUENCIAL
// ============================================================
describe('validators · validarSecuencial', () => {
  test('acepta hasta 9 dígitos', () => {
    assert.equal(validarSecuencial('1').valido, true);
    assert.equal(validarSecuencial('000000001').valido, true);
    assert.equal(validarSecuencial('999999999').valido, true);
  });

  test('rechaza > 9 dígitos', () => {
    assert.equal(validarSecuencial('1000000000').valido, false);
  });

  test('vacío → error', () => {
    assert.equal(validarSecuencial('').valido, false);
    assert.equal(validarSecuencial(null).valido, false);
  });

  test('solo ceros es válido (el caller decide si permitirlo)', () => {
    assert.equal(validarSecuencial('0').valido, true);
    assert.equal(validarSecuencial('000').valido, true);
  });
});

// ============================================================
// LOGO URL
// ============================================================
describe('validators · validarLogoUrl', () => {
  test('vacío es válido (campo opcional)', () => {
    assert.equal(validarLogoUrl('').valido, true);
    assert.equal(validarLogoUrl(null).valido, true);
    assert.equal(validarLogoUrl(undefined).valido, true);
  });

  test('URL http(s) válida', () => {
    assert.equal(validarLogoUrl('https://ejemplo.com/logo.png').valido, true);
    assert.equal(validarLogoUrl('http://cdn.midominio.com/x.png').valido, true);
  });

  test('data:image png base64', () => {
    const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    assert.equal(validarLogoUrl(url).valido, true);
  });

  test('rechaza esquemas peligrosos', () => {
    assert.equal(validarLogoUrl('javascript:alert(1)').valido, false);
    assert.equal(validarLogoUrl('data:text/html,<script>x</script>').valido, false);
    assert.equal(validarLogoUrl('file:///etc/passwd').valido, false);
  });

  test('rechaza caracteres de control', () => {
    assert.equal(validarLogoUrl('https://x.com/logo.png\r\nX-Injected: yes').valido, false);
  });

  test('rechaza por longitud excesiva', () => {
    const largo = 'https://x.com/' + 'a'.repeat(CONFIG.maxLogoLen);
    assert.equal(validarLogoUrl(largo).valido, false);
  });

  test('rechaza no-string', () => {
    assert.equal(validarLogoUrl(42).valido, false);
    assert.equal(validarLogoUrl({}).valido, false);
  });
});

// ============================================================
// Internos expuestos
// ============================================================
describe('validators · _provinciaValida', () => {
  test('acepta 01-24', () => {
    for (let i = 1; i <= 24; i++) {
      const s = String(i).padStart(2, '0');
      assert.equal(_provinciaValida(s), true, s);
    }
  });

  test('rechaza fuera de rango', () => {
    assert.equal(_provinciaValida('00'), false);
    assert.equal(_provinciaValida('25'), false);
    assert.equal(_provinciaValida('99'), false);
  });

  test('rechaza no-numéricos', () => {
    assert.equal(_provinciaValida('ab'), false);
    assert.equal(_provinciaValida(''), false);
  });
});

describe('validators · _validarModulo11', () => {
  test('devuelve boolean', () => {
    const r = _validarModulo11('1790012344001', [4, 3, 2, 7, 6, 5, 4, 3, 2]);
    assert.equal(typeof r, 'boolean');
  });
});

describe('validators · _PROVINCIAS_EC', () => {
  test('es un Set con 24 entradas', () => {
    assert.ok(_PROVINCIAS_EC instanceof Set);
    assert.equal(_PROVINCIAS_EC.size, 24);
  });

  test('incluye provincias clave', () => {
    assert.ok(_PROVINCIAS_EC.has(1));  // Azuay
    assert.ok(_PROVINCIAS_EC.has(17)); // Pichincha
    assert.ok(_PROVINCIAS_EC.has(24)); // Santa Elena
  });
});