-- vault-meta.db v4: editable Knowledge Base display name
-- dir_name remains the stable filesystem id; display_name is the user-facing title.

ALTER TABLE knowledge_bases ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
