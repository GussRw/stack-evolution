"""Funciones reutilizables del proyecto: carga, limpieza, segmentación e intervalos de confianza.

Todas las funciones son puras (no modifican sus argumentos) para que el notebook
pueda ejecutarse de arriba abajo sin estado oculto.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Constantes del proyecto
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[1]
DIR_PROCESADOS = ROOT / "data" / "processed"

# Versión fijada del dataset en Kaggle: garantiza que todos descarguen el mismo archivo.
KAGGLE_HANDLE = "berkayalan/stack-overflow-annual-developer-survey-2024/versions/1"
ARCHIVO_ENCUESTA = "survey_results_public.csv"

SEG_DEV = "Desarrollo (contribuidor individual)"
SEG_LIDER = "Liderazgo y dirección"
SEG_OTRO = "Otro"

ROLES_LIDERAZGO = frozenset({
    "Engineering manager",
    "Senior Executive (C-Suite, VP, etc.)",
})
# Prefijo con coma: excluye 'Developer Advocate' y 'Developer Experience',
# que no son roles de desarrollo como contribuidor individual.
PREFIJO_DESARROLLO = "Developer, "

RANGOS_EXP = ["0-2", "3-5", "6-10", "11-15", "16-20", "20+"]
CORTES_EXP = [-1, 2, 5, 10, 15, 20, np.inf]

RECODIFICACION_EXP = {"Less than 1 year": "0", "More than 50 years": "51"}


# ---------------------------------------------------------------------------
# Carga
# ---------------------------------------------------------------------------

def ruta_encuesta() -> Path:
    """Devuelve la ruta del CSV de la encuesta.

    Prioridad: variable de entorno SO_SURVEY_CSV (uso sin conexión o en CI)
    y, si no existe, descarga la versión fijada desde Kaggle con kagglehub.
    """
    local = os.environ.get("SO_SURVEY_CSV")
    if local:
        ruta = Path(local).expanduser()
        if not ruta.is_file():
            raise FileNotFoundError(f"SO_SURVEY_CSV apunta a un archivo inexistente: {ruta}")
        return ruta

    import kagglehub  # Import diferido: solo se necesita si no hay copia local

    return Path(kagglehub.dataset_download(KAGGLE_HANDLE)) / ARCHIVO_ENCUESTA


def cargar_encuesta(columnas: list[str]) -> pd.DataFrame:
    """Carga solo las columnas solicitadas y falla con un mensaje claro si falta alguna."""
    ruta = ruta_encuesta()
    disponibles = set(pd.read_csv(ruta, nrows=0).columns)
    faltantes = [c for c in columnas if c not in disponibles]
    if faltantes:
        raise KeyError(f"Columnas ausentes en {ruta.name}: {faltantes}")
    return pd.read_csv(ruta, usecols=columnas, low_memory=False)


# ---------------------------------------------------------------------------
# Limpieza y variables derivadas
# ---------------------------------------------------------------------------

def limpiar_experiencia(serie: pd.Series) -> pd.Series:
    """Convierte YearsCodePro de texto a numérico.

    'Less than 1 year' -> 0 y 'More than 50 years' -> 51 (cota inferior).
    Cualquier otro texto no numérico queda como NaN.
    """
    return pd.to_numeric(serie.replace(RECODIFICACION_EXP), errors="coerce")


def segmentar_rol(dev_type: pd.Series) -> pd.Series:
    """Asigna cada rol principal (DevType) a un segmento analítico.

    - Liderazgo y dirección: coincidencia exacta con ROLES_LIDERAZGO.
    - Desarrollo: roles que empiezan con 'Developer, '.
    - Otro: todo lo demás, incluidas respuestas vacías.
    """
    rol = dev_type.fillna("").astype(str).str.split(";").str[0].str.strip()
    segmento = np.select(
        [rol.isin(ROLES_LIDERAZGO), rol.str.startswith(PREFIJO_DESARROLLO)],
        [SEG_LIDER, SEG_DEV],
        default=SEG_OTRO,
    )
    return pd.Series(segmento, index=dev_type.index, name="Segmento")


def rango_experiencia(anios: pd.Series) -> pd.Series:
    """Discretiza los años de experiencia en los rangos ordinales del proyecto."""
    return pd.cut(anios, bins=CORTES_EXP, labels=RANGOS_EXP, ordered=True)


def explotar_multivalor(df: pd.DataFrame, columna: str, id_col: str = "ResponseId") -> pd.DataFrame:
    """Convierte una columna separada por ';' en formato largo (una fila por encuestado y valor).

    Descarta respuestas vacías y valores duplicados dentro del mismo encuestado.
    """
    largo = (
        df[[id_col, columna]]
        .dropna(subset=[columna])
        .assign(valor=lambda d: d[columna].str.split(";"))
        .explode("valor")
    )
    largo["valor"] = largo["valor"].str.strip()
    largo = largo[largo["valor"] != ""]
    return largo[[id_col, "valor"]].drop_duplicates().reset_index(drop=True)


# ---------------------------------------------------------------------------
# Proporciones e intervalos de confianza
# ---------------------------------------------------------------------------

def wilson(exitos, n, z: float = 1.96):
    """Intervalo de Wilson para una proporción. Devuelve (p, li, ls) en escala 0-1.

    Acepta escalares o arreglos; si n == 0 el resultado es NaN.
    """
    exitos = np.asarray(exitos, dtype=float)
    n = np.asarray(n, dtype=float)
    with np.errstate(divide="ignore", invalid="ignore"):
        p = exitos / n
        denom = 1 + z**2 / n
        centro = (p + z**2 / (2 * n)) / denom
        margen = z * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2)) / denom
    return p, centro - margen, centro + margen


def newcombe(exitos_a, n_a, exitos_b, n_b, z: float = 1.96):
    """IC de Newcombe (método 10, híbrido de Wilson) para la diferencia p_b − p_a.

    Devuelve (diferencia, li, ls) en escala 0-1. Se usa para comparar
    liderazgo (b) contra desarrollo (a) con un solo intervalo por tecnología.
    """
    p_a, l_a, u_a = wilson(exitos_a, n_a, z)
    p_b, l_b, u_b = wilson(exitos_b, n_b, z)
    d = p_b - p_a
    li = d - np.sqrt((p_b - l_b) ** 2 + (u_a - p_a) ** 2)
    ls = d + np.sqrt((u_b - p_b) ** 2 + (p_a - l_a) ** 2)
    return d, li, ls


def tabla_adopcion(
    base: pd.DataFrame,
    columna: str,
    por: list[str],
    top: list[str] | None = None,
    id_col: str = "ResponseId",
    z: float = 1.96,
) -> pd.DataFrame:
    """Calcula el % de adopción de cada valor de una columna multivalor por grupo.

    Denominador: encuestados del grupo que respondieron la pregunta (columna no nula).
    Así, quien dejó la pregunta en blanco no se cuenta como "no usa".
    Incluye las combinaciones con 0 usuarios para no perder celdas.

    Columnas devueltas: por + ['tecnologia', 'usuarios', 'total', 'p', 'li', 'ls'].
    """
    respondieron = base.dropna(subset=[columna])
    totales = respondieron.groupby(por, observed=True).size().rename("total").reset_index()

    largo = explotar_multivalor(respondieron, columna, id_col).merge(
        respondieron[[id_col, *por]], on=id_col
    )
    valores = top if top is not None else sorted(largo["valor"].unique())
    largo = largo[largo["valor"].isin(valores)]

    conteo = largo.groupby([*por, "valor"], observed=True).size().rename("usuarios").reset_index()

    rejilla = totales.merge(pd.DataFrame({"valor": valores}), how="cross")
    tabla = rejilla.merge(conteo, on=[*por, "valor"], how="left")
    tabla["usuarios"] = tabla["usuarios"].fillna(0).astype(int)

    tabla["p"], tabla["li"], tabla["ls"] = wilson(tabla["usuarios"], tabla["total"], z)
    return tabla.rename(columns={"valor": "tecnologia"})


def diferencia_adopcion(
    tabla: pd.DataFrame,
    por: list[str] | None = None,
    grupo: str = "Segmento",
    a: str = SEG_DEV,
    b: str = SEG_LIDER,
    min_n: int = 30,
    z: float = 1.96,
) -> pd.DataFrame:
    """Diferencia de adopción b − a con IC de Newcombe a partir de la salida de tabla_adopcion.

    `tabla` debe tener las columnas grupo + por + ['tecnologia', 'usuarios', 'total'].
    Se descartan los estratos donde cualquiera de los dos grupos tiene total < min_n.

    Columnas devueltas: por + ['tecnologia', 'n_a', 'n_b', 'p_a', 'p_b', 'd', 'li', 'ls'] (escala 0-1).
    """
    llaves = [*(por or []), "tecnologia"]
    columnas = [*llaves, "usuarios", "total"]
    ancha = tabla[tabla[grupo] == a][columnas].merge(
        tabla[tabla[grupo] == b][columnas], on=llaves, suffixes=("_a", "_b")
    )
    ancha = ancha[(ancha["total_a"] >= min_n) & (ancha["total_b"] >= min_n)].copy()

    ancha["d"], ancha["li"], ancha["ls"] = newcombe(
        ancha["usuarios_a"], ancha["total_a"], ancha["usuarios_b"], ancha["total_b"], z
    )
    ancha["p_a"] = ancha["usuarios_a"] / ancha["total_a"]
    ancha["p_b"] = ancha["usuarios_b"] / ancha["total_b"]
    ancha = ancha.rename(columns={"total_a": "n_a", "total_b": "n_b"})
    return ancha[[*llaves, "n_a", "n_b", "p_a", "p_b", "d", "li", "ls"]].reset_index(drop=True)


def top_valores(base: pd.DataFrame, columna: str, n: int, id_col: str = "ResponseId") -> list[str]:
    """Los n valores más frecuentes de una columna multivalor (contados por encuestado)."""
    return explotar_multivalor(base, columna, id_col)["valor"].value_counts().head(n).index.tolist()
