import { Box, Tooltip, Text } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useOrgName } from '@/hooks/useOrgName';
import { COLUMN_COLORS } from '@/util/taskUtils';
import { toMs, startOfDayMs, dateToPx } from './timeAxis';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = (ms) => {
  const d = new Date(ms);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

const TaskBar = ({ task, anchorMs, perDayPx, rowHeight }) => {
  const router = useRouter();
  const userDAO = useOrgName();

  const createdMs = toMs(task.createdAt);
  if (!Number.isFinite(createdMs)) return null;

  const endMs =
    toMs(task.completedAt) ||
    toMs(task.submittedAt) ||
    toMs(task.assignedAt) ||
    startOfDayMs(Date.now());

  const startMs = startOfDayMs(createdMs);
  const finishMs = Math.max(startOfDayMs(endMs), startMs + 86_400_000 * 0.4);

  const x = dateToPx(startMs, anchorMs, perDayPx);
  const w = dateToPx(finishMs, anchorMs, perDayPx) - x;
  const safeW = Math.max(w, perDayPx * 0.4);

  const isDone = task.columnId === 'completed';
  const color = COLUMN_COLORS[task.columnId] || '#A0AEC0';
  const opacity = isDone ? 0.45 : 0.85;
  const barH = rowHeight - 16;
  const barY = (rowHeight - barH) / 2;

  const open = () => {
    const safeProjectId = task.projectId
      ? encodeURIComponent(decodeURIComponent(task.projectId))
      : undefined;
    router.push(
      {
        pathname: '/tasks/',
        query: {
          ...router.query,
          org: userDAO,
          task: task.id,
          ...(safeProjectId ? { projectId: safeProjectId } : {}),
        },
      },
      undefined,
      { shallow: true },
    );
  };

  const tooltipLabel = (
    <Box>
      <Text fontWeight="600" fontSize="xs">
        {task.name || task.id}
      </Text>
      <Text fontSize="xs" color="whiteAlpha.700">
        {task.columnTitle || task.columnId} · {fmtDate(startMs)} → {fmtDate(finishMs)}
      </Text>
    </Box>
  );

  return (
    <Tooltip label={tooltipLabel} placement="top" hasArrow openDelay={200}>
      <Box
        role="button"
        tabIndex={0}
        aria-label={`Open task ${task.name || task.id}`}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
        position="absolute"
        left={`${x}px`}
        top={`${barY}px`}
        w={`${safeW}px`}
        h={`${barH}px`}
        bg={color}
        opacity={opacity}
        borderRadius="sm"
        cursor="pointer"
        transition="opacity 0.15s ease, transform 0.15s ease"
        _hover={{ opacity: 1, transform: 'translateY(-1px)' }}
        _focusVisible={{
          outline: 'none',
          boxShadow: '0 0 0 2px rgba(159,122,234,0.8)',
        }}
        overflow="hidden"
      >
        {safeW > 60 && (
          <Text
            fontSize="2xs"
            color="rgba(0,0,0,0.7)"
            fontWeight="600"
            px={1.5}
            lineHeight={`${barH}px`}
            noOfLines={1}
            pointerEvents="none"
          >
            {task.name || task.id}
          </Text>
        )}
      </Box>
    </Tooltip>
  );
};

export default TaskBar;
