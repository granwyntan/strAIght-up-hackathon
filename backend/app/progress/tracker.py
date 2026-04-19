from .. import repository


class ProgressTracker:
    def __init__(self, investigation_id: str):
        self.investigation_id = investigation_id

    def info(self, agent_key: str, message: str) -> None:
        repository.add_progress_event(self.investigation_id, agent_key, "info", message)

    def warning(self, agent_key: str, message: str) -> None:
        repository.add_progress_event(self.investigation_id, agent_key, "warning", message)

    def error(self, agent_key: str, message: str) -> None:
        repository.add_progress_event(self.investigation_id, agent_key, "error", message)

