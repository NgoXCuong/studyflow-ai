from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.dependencies import CurrentUser, Database, require_same_origin
from app.schemas.qa import AnswerOutput, QuestionInput
from app.services.qa import answer_question
from app.models.conversations import Conversation, ConversationTurn
from app.schemas.qa import ConversationOutput, ConversationTitleInput, TurnOutput
from app.services.conversations import get_conversation, send_question
from app.services.documents import get_document

router = APIRouter(tags=["document-qa"])


@router.post("/documents/{document_id}/ask", response_model=AnswerOutput,
             dependencies=[Depends(require_same_origin)])
def ask_document(document_id: UUID, data: QuestionInput, user: CurrentUser, db: Database):
    return answer_question(db, user, document_id, data.question)


@router.get("/documents/{document_id}/conversations", response_model=list[ConversationOutput])
def list_conversations(document_id: UUID, user: CurrentUser, db: Database,
                       limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    get_document(db, user, document_id)
    return db.scalars(select(Conversation).where(
        Conversation.owner_id == user.id, Conversation.document_id == document_id,
    ).order_by(Conversation.updated_at.desc(), Conversation.id.desc()).limit(limit).offset(offset)).all()


@router.post("/documents/{document_id}/conversations", response_model=ConversationOutput,
             status_code=201, dependencies=[Depends(require_same_origin)])
def create_conversation(document_id: UUID, data: ConversationTitleInput, user: CurrentUser, db: Database):
    get_document(db, user, document_id)
    conversation = Conversation(owner_id=user.id, document_id=document_id, title=data.title)
    db.add(conversation)
    db.flush()
    return conversation


@router.get("/conversations/{conversation_id}/turns", response_model=list[TurnOutput])
def read_turns(conversation_id: UUID, user: CurrentUser, db: Database,
               limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    get_conversation(db, user, conversation_id)
    return db.scalars(select(ConversationTurn).where(ConversationTurn.conversation_id == conversation_id)
                      .order_by(ConversationTurn.created_at.desc(), ConversationTurn.id.desc()).limit(limit).offset(offset)).all()


@router.post("/conversations/{conversation_id}/turns", response_model=TurnOutput,
             status_code=201, dependencies=[Depends(require_same_origin)])
def create_turn(conversation_id: UUID, data: QuestionInput, user: CurrentUser, db: Database):
    return send_question(db, user, conversation_id, data.question)


@router.patch("/conversations/{conversation_id}", response_model=ConversationOutput,
              dependencies=[Depends(require_same_origin)])
def rename_conversation(conversation_id: UUID, data: ConversationTitleInput, user: CurrentUser, db: Database):
    conversation = get_conversation(db, user, conversation_id, lock=True)
    conversation.title = data.title
    db.flush()
    return conversation


@router.delete("/conversations/{conversation_id}", dependencies=[Depends(require_same_origin)])
def delete_conversation(conversation_id: UUID, user: CurrentUser, db: Database):
    db.delete(get_conversation(db, user, conversation_id, lock=True))
    db.flush()
    return {"message": "Đã xóa hội thoại."}
