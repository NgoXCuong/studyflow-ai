from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.dependencies import CurrentUser, Database, require_roles, require_same_origin
from app.schemas.study_plans import PlanCreate, PlanInput, PlanOutput, PlanSummary, TaskUpdate
from app.services.study_plans import configure_plan, create_plan, get_plan, list_plans, plan_output, reschedule, tasks_for, update_task

router = APIRouter(prefix="/study-plans", tags=["study-plans"], dependencies=[Depends(require_roles("student"))])
write = [Depends(require_same_origin)]


@router.get("", response_model=list[PlanSummary])
def read_plans(user: CurrentUser, db: Database, limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    return list_plans(db, user, limit, offset)


@router.post("", response_model=PlanOutput, status_code=201, dependencies=write)
def add_plan(data: PlanCreate, user: CurrentUser, db: Database):
    return create_plan(db, user, data)


@router.get("/{plan_id}", response_model=PlanOutput)
def read_plan(plan_id: UUID, user: CurrentUser, db: Database):
    return plan_output(db, user, get_plan(db, user, plan_id))


@router.put("/{plan_id}", response_model=PlanOutput, dependencies=write)
def edit_plan(plan_id: UUID, data: PlanInput, user: CurrentUser, db: Database):
    plan = get_plan(db, user, plan_id, lock=True)
    durations = {kind: getattr(data, field) for kind, field in (("read", "read_minutes"), ("quiz", "quiz_minutes"), ("review", "review_minutes"))
                 if getattr(plan, field) != getattr(data, field)}
    configure_plan(plan, data)
    for task in tasks_for(db, plan):
        if task.completed_at is None and task.kind in durations:
            task.duration_minutes = durations[task.kind]
    reschedule(db, user, plan)
    return plan_output(db, user, plan)


@router.post("/{plan_id}/reschedule", response_model=PlanOutput, dependencies=write)
def rearrange_plan(plan_id: UUID, user: CurrentUser, db: Database):
    plan = get_plan(db, user, plan_id, lock=True)
    reschedule(db, user, plan)
    return plan_output(db, user, plan)


@router.patch("/{plan_id}/tasks/{task_id}", response_model=PlanOutput, dependencies=write)
def edit_task(plan_id: UUID, task_id: UUID, data: TaskUpdate, user: CurrentUser, db: Database):
    return update_task(db, user, get_plan(db, user, plan_id, lock=True), task_id, data)


@router.delete("/{plan_id}", status_code=204, dependencies=write)
def remove_plan(plan_id: UUID, user: CurrentUser, db: Database):
    db.delete(get_plan(db, user, plan_id, lock=True))
    db.flush()
    return Response(status_code=204)
