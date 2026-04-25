"""
DAG integrity tests — confirms every DAG parses without errors,
declares a valid schedule, has no import-time exceptions, and contains
no cycles. Equivalent to `astro dev parse` but lives in the test suite
so CI can run it without the Astro CLI.
"""

import pytest
from airflow.models import DagBag


@pytest.fixture(scope="session")
def dag_bag() -> DagBag:
    return DagBag(dag_folder="dags/", include_examples=False)


def test_no_import_errors(dag_bag: DagBag) -> None:
    assert not dag_bag.import_errors, (
        f"DAGs failed to import: {dag_bag.import_errors}"
    )


def test_calibration_check_present(dag_bag: DagBag) -> None:
    assert "elevator_pitch_calibration_check" in dag_bag.dag_ids, (
        "elevator_pitch_calibration_check DAG missing from DagBag — "
        f"loaded: {dag_bag.dag_ids}"
    )


def test_calibration_check_structure(dag_bag: DagBag) -> None:
    """
    Three parallel evaluation tasks fan into one drift-check task.
    If anyone refactors and accidentally serializes the evaluations,
    this test fails — keeps the parallelism guarantee load-bearing.
    """
    dag = dag_bag.get_dag("elevator_pitch_calibration_check")
    assert dag is not None

    task_ids = {t.task_id for t in dag.tasks}
    expected = {"evaluate_weak", "evaluate_mid", "evaluate_strong", "check_drift"}
    assert expected.issubset(task_ids), (
        f"Expected tasks {expected} not all present. Found: {task_ids}"
    )

    check = dag.get_task("check_drift")
    upstream = {t.task_id for t in check.upstream_list}
    assert upstream == {"evaluate_weak", "evaluate_mid", "evaluate_strong"}, (
        f"check_drift should have all three evaluate_* as upstream. "
        f"Found upstream: {upstream}"
    )

    # All three evaluations should be siblings (no order between them).
    for tier in ("weak", "mid", "strong"):
        eval_task = dag.get_task(f"evaluate_{tier}")
        assert not eval_task.upstream_list, (
            f"evaluate_{tier} should be a root task (no upstream). "
            f"Found upstream: {[t.task_id for t in eval_task.upstream_list]}"
        )
