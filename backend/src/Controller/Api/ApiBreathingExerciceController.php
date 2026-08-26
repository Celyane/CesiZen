<?php

namespace App\Controller\Api;

use App\Entity\BreathingExercice;
use App\Entity\User;
use App\Repository\BreathingExerciceRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/breathing-exercices')]
class ApiBreathingExerciceController extends AbstractController
{
    private function serialize(BreathingExercice $ex, ?User $user = null): array
    {
        $data = [
            'id' => $ex->getId(),
            'name' => $ex->getName(),
            'duration' => $ex->getDuration(),
            'description' => $ex->getDescription(),
            'type' => $ex->getType(),
            'timeInhale' => $ex->getTimeInhale(),
            'timeHold' => $ex->getTimeHold(),
            'timeExhale' => $ex->getTimeExhale(),
            'numberCycle' => $ex->getNumberCycle(),
            'createdAt' => $ex->getCreatedAt()?->format('Y-m-d H:i:s'),
        ];

        if ($user) {
            $data['isDone'] = $ex->getUsers()->contains($user);
        }

        return $data;
    }

    #[Route('', name: 'api_breathing_list', methods: ['GET'])]
    public function list(BreathingExerciceRepository $repo): JsonResponse
    {
        /** @var User|null $user */
        $user = $this->getUser();
        $exercices = $repo->findAll();

        return $this->json(array_map(fn ($e) => $this->serialize($e, $user), $exercices));
    }

    #[Route('/{id}', name: 'api_breathing_show', methods: ['GET'])]
    public function show(BreathingExercice $exercice): JsonResponse
    {
        /** @var User|null $user */
        $user = $this->getUser();
        return $this->json($this->serialize($exercice, $user));
    }

    #[Route('', name: 'api_breathing_create', methods: ['POST'])]
    #[IsGranted('ROLE_ADMIN')]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        $required = ['name', 'duration', 'description', 'type', 'timeInhale', 'timeExhale', 'numberCycle'];
        foreach ($required as $field) {
            if (!isset($data[$field])) {
                return $this->json(['message' => "Field '$field' is required"], Response::HTTP_BAD_REQUEST);
            }
        }

        $ex = new BreathingExercice();
        $ex->setName($data['name']);
        $ex->setDuration((int) $data['duration']);
        $ex->setDescription($data['description']);
        $ex->setType($data['type']);
        $ex->setTimeInhale((int) $data['timeInhale']);
        $ex->setTimeHold(isset($data['timeHold']) ? (int) $data['timeHold'] : null);
        $ex->setTimeExhale((int) $data['timeExhale']);
        $ex->setNumberCycle((int) $data['numberCycle']);

        $em->persist($ex);
        $em->flush();

        return $this->json($this->serialize($ex), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'api_breathing_update', methods: ['PUT'])]
    #[IsGranted('ROLE_ADMIN')]
    public function update(BreathingExercice $exercice, Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (isset($data['name'])) {
            $exercice->setName($data['name']);
        }
        if (isset($data['duration'])) {
            $exercice->setDuration((int) $data['duration']);
        }
        if (isset($data['description'])) {
            $exercice->setDescription($data['description']);
        }
        if (isset($data['type'])) {
            $exercice->setType($data['type']);
        }
        if (isset($data['timeInhale'])) {
            $exercice->setTimeInhale((int) $data['timeInhale']);
        }
        if (array_key_exists('timeHold', $data)) {
            $exercice->setTimeHold($data['timeHold'] !== null ? (int) $data['timeHold'] : null);
        }
        if (isset($data['timeExhale'])) {
            $exercice->setTimeExhale((int) $data['timeExhale']);
        }
        if (isset($data['numberCycle'])) {
            $exercice->setNumberCycle((int) $data['numberCycle']);
        }

        $em->flush();

        return $this->json($this->serialize($exercice));
    }

    #[Route('/{id}', name: 'api_breathing_delete', methods: ['DELETE'])]
    #[IsGranted('ROLE_ADMIN')]
    public function delete(BreathingExercice $exercice, EntityManagerInterface $em): JsonResponse
    {
        $em->remove($exercice);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/complete', name: 'api_breathing_complete', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function complete(BreathingExercice $exercice, EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        if (!$exercice->getUsers()->contains($user)) {
            $user->addExerciceDone($exercice);
            $em->flush();
        }

        return $this->json(['message' => 'Exercise marked as completed', 'isDone' => true]);
    }
}
