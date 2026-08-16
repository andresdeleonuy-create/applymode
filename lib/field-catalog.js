// Fuente única de verdad: qué campos existen, cómo reconocerlos en un
// formulario, y cómo se guardan. La usan tanto options.js como content-script.js
// (se cargan como scripts hermanos, comparten el mismo window).
(function () {
  const FIELD_CATALOG = {
    // ─── Generales: un solo valor, compartido por todos los perfiles ───
    nombre: {
      group: 'general', label: 'Nombre', inputKind: 'text',
      autocomplete: ['given-name'],
      synonyms: ['nombre', 'nombres', 'first name', 'firstname', 'fname'],
    },
    apellido: {
      group: 'general', label: 'Apellido', inputKind: 'text',
      autocomplete: ['family-name'],
      synonyms: ['apellido', 'apellidos', 'last name', 'lastname', 'lname', 'surname'],
    },
    // Se calcula solo (nombre + apellido) — no se pide de nuevo en Opciones.
    // Muchos formularios (Lever, Greenhouse) piden "Full name" en un solo
    // campo en vez de nombre/apellido separados; sin esta entrada, ese campo
    // quedaba vacío o —peor— se llenaba solo con el nombre, sin el apellido.
    nombreCompleto: {
      group: 'general', label: 'Nombre completo', inputKind: 'text', derived: true,
      autocomplete: ['name'],
      synonyms: ['nombre completo', 'nombre y apellido', 'full name', 'fullname'],
    },
    email: {
      group: 'general', label: 'Email', inputKind: 'email',
      autocomplete: ['email'], htmlInputType: 'email',
      synonyms: ['email', 'correo', 'correo electronico', 'e mail', 'mail'],
    },
    telefono: {
      group: 'general', label: 'Teléfono', inputKind: 'tel',
      autocomplete: ['tel'], htmlInputType: 'tel',
      synonyms: ['telefono', 'phone', 'celular', 'movil', 'numero de telefono', 'tel'],
    },
    cedula: {
      group: 'general', label: 'Cédula de identidad', inputKind: 'text',
      autocomplete: [],
      synonyms: ['cedula', 'ci', 'documento', 'dni', 'numero de documento', 'cedula de identidad'],
    },
    fechaNacimiento: {
      group: 'general', label: 'Fecha de nacimiento', inputKind: 'date',
      autocomplete: ['bday'], htmlInputType: 'date',
      synonyms: ['fecha de nacimiento', 'nacimiento', 'birthdate', 'birthday', 'fecha nac'],
    },
    direccion: {
      group: 'general', label: 'Dirección', inputKind: 'text',
      autocomplete: ['street-address'],
      synonyms: ['direccion', 'domicilio', 'address', 'calle'],
    },
    ciudad: {
      group: 'general', label: 'Ciudad / Localidad', inputKind: 'text',
      autocomplete: ['address-level2'],
      synonyms: ['ciudad', 'localidad', 'city'],
    },
    departamento: {
      group: 'general', label: 'Departamento', inputKind: 'select',
      autocomplete: ['address-level1'],
      synonyms: ['departamento', 'provincia', 'state', 'region'],
    },
    pais: {
      group: 'general', label: 'País', inputKind: 'text',
      autocomplete: ['country-name'],
      synonyms: ['pais', 'country', 'nacion'],
    },
    linkedin: {
      group: 'general', label: 'LinkedIn', inputKind: 'url',
      autocomplete: ['url'], htmlInputType: 'url',
      synonyms: ['linkedin'],
    },
    portfolio: {
      group: 'general', label: 'Portfolio / sitio web', inputKind: 'url',
      autocomplete: ['url'], htmlInputType: 'url',
      synonyms: ['portfolio', 'portafolio', 'sitio web', 'website', 'pagina web'],
    },

    // ─── Por perfil: cambian según a qué te postulás ───
    tituloProfesional: {
      group: 'perfil', label: 'Título / cargo deseado', inputKind: 'text',
      autocomplete: [],
      synonyms: ['titulo profesional', 'cargo', 'puesto', 'posicion', 'position', 'titulo'],
    },
    descripcionProfesional: {
      group: 'perfil', label: 'Descripción profesional', inputKind: 'textarea',
      autocomplete: [],
      synonyms: ['descripcion', 'resumen', 'perfil profesional', 'about', 'acerca de', 'bio', 'sobre mi', 'sobre vos', 'summary'],
    },
    experiencia: {
      group: 'perfil', label: 'Experiencia laboral', inputKind: 'textarea',
      autocomplete: [],
      synonyms: ['experiencia', 'experiencia laboral', 'experience', 'work experience', 'trayectoria'],
    },
    cartaPresentacion: {
      group: 'perfil', label: 'Carta de presentación', inputKind: 'textarea',
      autocomplete: [],
      synonyms: ['carta de presentacion', 'carta presentacion', 'cover letter', 'mensaje', 'por que te interesa', 'motivacion'],
    },
    pretensionSalarial: {
      group: 'perfil', label: 'Pretensión salarial', inputKind: 'text',
      autocomplete: [],
      synonyms: ['pretension salarial', 'expectativa salarial', 'salario esperado', 'remuneracion esperada', 'salary expectation', 'expected salary'],
    },
  };

  const DEPARTAMENTOS = [
    'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida',
    'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha',
    'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres',
  ];

  function limpiarCedula(cedula) {
    return (cedula || '').toString().replace(/[^0-9]/g, '');
  }

  // Algoritmo de dígito verificador de la cédula de identidad uruguaya.
  function validarCedulaUY(cedula) {
    const digits = limpiarCedula(cedula);
    if (digits.length < 7 || digits.length > 8) return false;
    const checkDigit = Number(digits.slice(-1));
    const base = digits.slice(0, -1).padStart(7, '0').split('').map(Number);
    const coef = [2, 9, 8, 7, 6, 3, 4];
    const sum = base.reduce((acc, d, i) => acc + d * coef[i], 0);
    const rem = sum % 10;
    const expected = rem === 0 ? 0 : 10 - rem;
    return expected === checkDigit;
  }

  window.AUTOFILL_UY = { FIELD_CATALOG, DEPARTAMENTOS, validarCedulaUY, limpiarCedula };
})();
