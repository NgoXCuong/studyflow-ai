from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class PDFSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    page_number: int = Field(ge=1, strict=True)
    text: Text


class Flashcard(BaseModel):
    model_config = ConfigDict(extra="forbid")
    front: Text
    back: Text
    source_ids: list[UUID] = Field(default_factory=list, max_length=5)
    known: bool = False
    review_streak: int = Field(default=0, ge=0, le=6, strict=True)
    last_reviewed_at: AwareDatetime | None = None
    next_review_at: AwareDatetime | None = None
    excerpt: PDFSelection | None = None


class MindNode(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Title
    parent_id: Title | None = None
    label: Title
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)] = ""
    source_ids: list[UUID] = Field(default_factory=list, max_length=5)
    excerpt: PDFSelection | None = None


class MaterialContent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cards: list[Flashcard] = Field(default_factory=list, max_length=50)
    nodes: list[MindNode] = Field(default_factory=list, max_length=30)

    def validate_kind(self, kind: str):
        if kind == "flashcards":
            if not self.cards or self.nodes:
                raise ValueError("Bộ thẻ cần 1–50 thẻ và không chứa nút sơ đồ.")
            return self
        if self.cards or not self.nodes:
            raise ValueError("Sơ đồ cần 1–30 nút và không chứa flashcard.")
        by_id = {node.id: node for node in self.nodes}
        if len(by_id) != len(self.nodes) or sum(node.parent_id is None for node in self.nodes) != 1:
            raise ValueError("Sơ đồ cần ID duy nhất và đúng một nút gốc.")
        for node in self.nodes:
            visited = {node.id}
            parent = node.parent_id
            while parent is not None:
                if parent not in by_id or parent in visited:
                    raise ValueError("Nhánh sơ đồ không hợp lệ hoặc có vòng lặp.")
                visited.add(parent)
                parent = by_id[parent].parent_id
        return self


class MaterialInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["flashcards", "mindmap"]
    title: Title
    content: MaterialContent

    @model_validator(mode="after")
    def valid_content(self):
        self.content.validate_kind(self.kind)
        return self


class GenerateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["flashcards", "mindmap"]
    title: Title
    count: int = Field(default=5, ge=1, le=50, strict=True)

    @model_validator(mode="after")
    def valid_count(self):
        if self.kind == "mindmap" and self.count > 30:
            raise ValueError("Sơ đồ tư duy tối đa 30 nút.")
        return self


class MaterialSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    document_id: UUID
    kind: Literal["flashcards", "mindmap"]
    title: str
    generation_model: str | None
    created_at: datetime
    updated_at: datetime


class MaterialOutput(MaterialSummary):
    content: MaterialContent
    sources: list[dict]


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    known: bool = Field(strict=True)


class SelectionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["flashcards", "mindmap"]
    selection: PDFSelection
    label: Title
    title: Title | None = None
    material_id: UUID | None = None
    parent_id: Title | None = None

    @model_validator(mode="after")
    def valid_target(self):
        if self.material_id is None and self.title is None:
            raise ValueError("Cần tên học liệu mới.")
        if self.kind == "flashcards" and self.parent_id is not None:
            raise ValueError("Flashcard không có nhánh cha.")
        return self
