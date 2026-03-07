import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  EnvironmentResponse,
  TicketGitEnvironmentResponse,
} from "@/modules/environments/contracts/environment-contracts";

const AUTO_SELECT_VALUE = "__auto__";
const AUTO_DEV_BRANCH_VALUE = "auto";

type TicketManagerEnvironmentCardProps = {
  ticketGitEnvironments: TicketGitEnvironmentResponse[];
  environments: EnvironmentResponse[];
  defaultGitEnvironmentId: number | undefined;
  detailLoading: boolean;
  actionLoading: boolean;
  onSelectedDevBranchChange: (devBranch: string | undefined) => void;
  onAssignDefaultEnvironment: (ticketGitEnvironmentId: number) => Promise<void>;
  onCreateTicketGitEnvironment: (
    baseEnvironmentId: string,
    devBranch: string | undefined,
  ) => Promise<void>;
};

export const TicketManagerEnvironmentCard = ({
  ticketGitEnvironments,
  environments,
  defaultGitEnvironmentId,
  detailLoading,
  actionLoading,
  onSelectedDevBranchChange,
  onAssignDefaultEnvironment,
  onCreateTicketGitEnvironment,
}: TicketManagerEnvironmentCardProps) => {
  const currentDefaultEnvironment = ticketGitEnvironments.find(
    (environment) => environment.id === defaultGitEnvironmentId,
  );

  const [selectedTicketGitEnvironmentId, setSelectedTicketGitEnvironmentId] = useState(
    currentDefaultEnvironment?.id?.toString() ?? AUTO_SELECT_VALUE,
  );
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newBaseEnvironmentId, setNewBaseEnvironmentId] = useState(
    environments[0]?.environmentId ?? "",
  );
  const [newDevBranch, setNewDevBranch] = useState(AUTO_DEV_BRANCH_VALUE);

  const selectedTicketGitEnvironment = ticketGitEnvironments.find(
    (environment) =>
      environment.id.toString() === selectedTicketGitEnvironmentId,
  );

  useEffect(() => {
    onSelectedDevBranchChange(selectedTicketGitEnvironment?.devBranch);
  }, [onSelectedDevBranchChange, selectedTicketGitEnvironment?.devBranch]);

  const baseEnvironmentOptions = Array.from(
    new Set(environments.map((environment) => environment.environmentId)),
  );
  const assignmentMatchesCurrentDefault =
    selectedTicketGitEnvironmentId ===
    (currentDefaultEnvironment?.id?.toString() ?? AUTO_SELECT_VALUE);

  const handleCreateEnvironment = async () => {
    if (!newBaseEnvironmentId) {
      return;
    }

    await onCreateTicketGitEnvironment(
      newBaseEnvironmentId,
      newDevBranch.trim().toLowerCase() === AUTO_DEV_BRANCH_VALUE
        ? undefined
        : newDevBranch.trim(),
    );

    setAddDialogOpen(false);
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="subtitle1">Default Git Environment</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              select
              size="small"
              value={selectedTicketGitEnvironmentId}
              onChange={(event) => {
                setSelectedTicketGitEnvironmentId(event.target.value);
              }}
              sx={{ minWidth: { xs: "100%", sm: 230 } }}
              disabled={detailLoading || actionLoading}
            >
              <MenuItem value={AUTO_SELECT_VALUE}>auto</MenuItem>
              {ticketGitEnvironments.map((ticketGitEnvironment) => (
                <MenuItem
                  key={ticketGitEnvironment.id}
                  value={ticketGitEnvironment.id.toString()}
                >
                  {ticketGitEnvironment.baseEnvironmentId} |{" "}
                  {ticketGitEnvironment.devBranch}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              onClick={() => {
                if (!newBaseEnvironmentId && baseEnvironmentOptions[0]) {
                  setNewBaseEnvironmentId(baseEnvironmentOptions[0]);
                }
                setAddDialogOpen(true);
              }}
              disabled={detailLoading || actionLoading}
            >
              Add
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                if (!selectedTicketGitEnvironment) {
                  return;
                }

                void onAssignDefaultEnvironment(selectedTicketGitEnvironment.id);
              }}
              disabled={
                detailLoading ||
                actionLoading ||
                selectedTicketGitEnvironmentId === AUTO_SELECT_VALUE ||
                !selectedTicketGitEnvironment ||
                assignmentMatchesCurrentDefault
              }
            >
              Make default
            </Button>
          </Stack>
        </Stack>
      </CardContent>

      <Dialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Ticket Git Environment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              size="small"
              label="Base environment"
              value={newBaseEnvironmentId}
              onChange={(event) => setNewBaseEnvironmentId(event.target.value)}
              disabled={detailLoading || actionLoading}
            >
              {baseEnvironmentOptions.map((baseEnvironmentId) => (
                <MenuItem key={baseEnvironmentId} value={baseEnvironmentId}>
                  {baseEnvironmentId}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="Dev branch"
              value={newDevBranch}
              onChange={(event) => setNewDevBranch(event.target.value)}
              disabled={detailLoading || actionLoading}
              helperText="Use 'auto' to let the system generate the branch."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => void handleCreateEnvironment()}
            disabled={!newBaseEnvironmentId || detailLoading || actionLoading}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};
