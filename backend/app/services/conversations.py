from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.models.auth import User
from app.models.conversations import Conversation, ConversationTurn
from app.schemas.qa import AnswerOutput
from app.services.documents import get_document
from app.services.qa import answer_question


def get_conversation(db: Session, user: User, conversation_id: UUID, *, lock=False) -> Conversation:
    query = select(Conversation).where(Conversation.id == conversation_id, Conversation.owner_id == user.id)
    try:
        conversation = db.scalar(query.with_for_update(nowait=True) if lock else query)
    except OperationalError as exc:
        if getattr(exc.orig, "sqlstate", None) == "55P03":
            raise HTTPException(409, "Hội thoại đang xử lý yêu cầu khác. Vui lòng thử lại sau.") from exc
        raise
    if conversation is None:
        raise HTTPException(404, "Không tìm thấy hội thoại.")
    get_document(db, user, conversation.document_id)
    return conversation


def send_question(db: Session, user: User, conversation_id: UUID, question: str) -> ConversationTurn:
    conversation = get_conversation(db, user, conversation_id, lock=True)
    recent = list(db.scalars(select(ConversationTurn).where(
        ConversationTurn.conversation_id == conversation.id,
    ).order_by(ConversationTurn.created_at.desc(), ConversationTurn.id.desc()).limit(6)))
    history = [{"question": turn.question, "answer": turn.answer["answer"][:4000]} for turn in reversed(recent)]
    answer: AnswerOutput = answer_question(db, user, conversation.document_id, question, history=history)
    turn = ConversationTurn(conversation_id=conversation.id, question=question, answer=answer.model_dump(mode="json"))
    db.add(turn)
    conversation.updated_at = datetime.now(timezone.utc)
    db.flush()
    return turn
