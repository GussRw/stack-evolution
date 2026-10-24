"""Pruebas de las funciones de limpieza e intervalos. Ejecutar desde la raíz con: pytest -q"""

import numpy as np
import pandas as pd
import pytest
from statsmodels.stats.proportion import confint_proportions_2indep, proportion_confint

from src import utils


def test_limpiar_experiencia_recodifica_textos():
    serie = pd.Series(["Less than 1 year", "7", "More than 50 years", None, "abc"])
    resultado = utils.limpiar_experiencia(serie)
    assert resultado.tolist()[:3] == [0, 7, 51]
    assert resultado.iloc[3:].isna().all()


def test_segmentar_rol_excluye_advocate_y_experience():
    roles = pd.Series([
        "Developer, back-end", "Developer Advocate", "Developer Experience",
        "Engineering manager", "Senior Executive (C-Suite, VP, etc.)", "Student", None,
    ])
    esperado = [utils.SEG_DEV, utils.SEG_OTRO, utils.SEG_OTRO,
                utils.SEG_LIDER, utils.SEG_LIDER, utils.SEG_OTRO, utils.SEG_OTRO]
    assert utils.segmentar_rol(roles).tolist() == esperado


def test_rango_experiencia_limites():
    rangos = utils.rango_experiencia(pd.Series([0, 2, 3, 20, 21, 51]))
    assert rangos.astype(str).tolist() == ["0-2", "0-2", "3-5", "16-20", "20+", "20+"]


def test_wilson_coincide_con_statsmodels():
    p, li, ls = utils.wilson(37, 120)
    ref_li, ref_ls = proportion_confint(37, 120, alpha=0.05, method="wilson")
    assert p == pytest.approx(37 / 120)
    assert li == pytest.approx(ref_li, abs=1e-3) and ls == pytest.approx(ref_ls, abs=1e-3)


def test_wilson_n_cero_devuelve_nan():
    assert np.isnan(utils.wilson(0, 0)[0])


def test_newcombe_coincide_con_statsmodels():
    # statsmodels calcula p1 - p2; utils.newcombe calcula p_b - p_a
    d, li, ls = utils.newcombe(415, 1000, 62, 100)
    ref = confint_proportions_2indep(62, 100, 415, 1000, method="newcomb", compare="diff")
    assert d == pytest.approx(0.62 - 0.415)
    assert li == pytest.approx(ref[0], abs=1e-3) and ls == pytest.approx(ref[1], abs=1e-3)


def test_tabla_adopcion_usa_solo_quien_respondio():
    base = pd.DataFrame({
        "ResponseId": [1, 2, 3, 4],
        "Segmento": ["A", "A", "A", "B"],
        "Tec": ["AWS;Docker", "AWS", None, "Docker"],
    })
    tabla = utils.tabla_adopcion(base, "Tec", por=["Segmento"]).set_index(["Segmento", "tecnologia"])
    assert tabla.loc[("A", "AWS"), "total"] == 2          # el encuestado 3 no respondió
    assert tabla.loc[("A", "AWS"), "p"] == pytest.approx(1.0)
    assert tabla.loc[("B", "AWS"), "usuarios"] == 0        # combinación sin usuarios se conserva


def test_diferencia_adopcion_newcombe_y_umbral():
    tabla = pd.DataFrame({
        "Segmento": [utils.SEG_DEV, utils.SEG_LIDER, utils.SEG_DEV, utils.SEG_LIDER],
        "Rango": ["6-10", "6-10", "0-2", "0-2"],
        "tecnologia": ["AWS"] * 4,
        "usuarios": [415, 62, 10, 5],
        "total": [1000, 100, 200, 16],
    })
    dif = utils.diferencia_adopcion(tabla, por=["Rango"], min_n=30)
    assert dif["Rango"].tolist() == ["6-10"]               # 0-2 se descarta: liderazgo con n < 30
    d, li, ls = utils.newcombe(415, 1000, 62, 100)
    fila = dif.iloc[0]
    assert (fila["d"], fila["li"], fila["ls"]) == pytest.approx((d, li, ls))
    assert (fila["n_a"], fila["n_b"]) == (1000, 100)
